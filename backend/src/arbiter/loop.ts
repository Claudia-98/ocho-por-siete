// Ciclo del bot: GET /api/next → decidir → POST /api/move, para siempre.
// PLAN_BACKEND.md §7. Todo se inyecta (cliente, algoritmo, reloj, sleep, log) para probarlo sin red.
import { MOVE_ORDER, type MoveDecision } from "../engine/index.js";
import { AuthError, type ArbiterClient, type MoveResult } from "./client.js";
import type { Turn } from "./types.js";

export interface LoopDeps {
  client: Pick<ArbiterClient, "next" | "move">;
  /** Elige la columna para un turno (en el bot: chooseMove con BUDGET_MS). */
  decide: (turn: Turn) => MoveDecision;
  log: (line: string) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /** Segundos de long polling (máx. 25 en el árbitro). */
  waitSeconds?: number;
  /** Para detener el ciclo (Ctrl+C o pruebas). */
  shouldStop?: () => boolean;
}

export const BACKOFF_MS = [500, 1000, 2000, 4000] as const;
/** No reintentar el POST si ya pasó este tiempo desde que recibimos el turno. */
const RETRY_MOVE_UNTIL_MS = 2500;

/** La columna final siempre sale de legal_moves (PLAN_BACKEND.md §6, red de seguridad). */
export function safeColumn(column: number, legalMoves: readonly number[]): number {
  if (legalMoves.includes(column)) return column;
  return MOVE_ORDER.find((c) => legalMoves.includes(c)) ?? legalMoves[0] ?? column;
}

/** Juega un turno: decide, valida y envía. Devuelve el resultado del POST. */
export async function playTurn(turn: Turn, deps: LoopDeps, receivedAt = deps.now()): Promise<MoveResult> {
  let decision: MoveDecision;
  try {
    decision = deps.decide(turn);
  } catch (err) {
    deps.log(`[${turn.game_id}] el algoritmo falló (${String(err)}); se usa la red de seguridad`);
    decision = { column: -1, stats: { depth: 0, nodes: 0, ms: 0, score: 0, reason: "fallback" } };
  }
  const column = safeColumn(decision.column, turn.legal_moves);
  if (column !== decision.column && decision.column !== -1) {
    deps.log(`[${turn.game_id}] el algoritmo devolvió la columna ${decision.column}, que no está en legal_moves; se juega ${column}`);
  }

  let result: MoveResult;
  try {
    result = await deps.client.move(turn.game_id, column);
  } catch (err) {
    if (err instanceof AuthError) throw err;
    // Si se perdió la conexión, reintentar una vez es seguro: si la jugada sí llegó, responde 409.
    if (deps.now() - receivedAt > RETRY_MOVE_UNTIL_MS) throw err;
    deps.log(`[${turn.game_id}] error de red al enviar (${String(err)}); se reintenta una vez`);
    result = await deps.client.move(turn.game_id, column);
  }

  const s = decision.stats;
  const head = `[${turn.game_id}] turno ${turn.turn} · soy ${turn.you} vs ${turn.opponent} · columna ${column}`;
  const stats = `prof ${s.depth} · ${s.nodes} nodos · ${s.ms} ms · valor ${s.score} (${s.reason})`;
  deps.log(`${head} · ${stats} → ${describe(result)}`);
  return result;
}

function describe(result: MoveResult): string {
  if (result.kind === "accepted") {
    const r = result.response;
    if (r.state === "won") return `¡GANAMOS! ${JSON.stringify(r.winning_cells ?? [])}`;
    if (r.state === "draw") return "empate";
    return "sigue";
  }
  const tag = result.penalized ? "PERDIMOS LA PARTIDA" : "sin penalización";
  return `${result.status} ${result.error.error} (${tag}): ${result.error.message ?? ""}`;
}

/** Ciclo infinito del bot. Solo se detiene con `shouldStop` o con un 401 (AuthError). */
export async function runLoop(deps: LoopDeps): Promise<void> {
  const wait = deps.waitSeconds ?? 20;
  let failures = 0;
  while (!deps.shouldStop?.()) {
    try {
      const next = await deps.client.next(wait);
      const receivedAt = deps.now();
      failures = 0;
      if (next.status === "idle") continue;
      await playTurn(next, deps, receivedAt);
    } catch (err) {
      if (err instanceof AuthError) {
        deps.log(`ERROR: ${err.message} El bot se detiene.`);
        throw err;
      }
      // Cualquier otro error (red, árbitro caído, respuesta rara): log y seguir. Nunca 30 s sin preguntar.
      const delay = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)]!;
      failures++;
      deps.log(`error: ${String(err)} · reintento en ${delay} ms`);
      await deps.sleep(delay);
    }
  }
}
