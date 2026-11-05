// API para la app web (PLAN_BACKEND.md §8). Router puro: recibe la petición ya parseada y
// devuelve { status, body }. Así se prueba sin abrir puertos y la capa HTTP queda mínima.
// Sin estado: el frontend manda la lista de jugadas y el backend es la única autoridad de las reglas.
import { chooseMove, type MoveStats } from "../engine/index.js";
import {
  COLS,
  CELLS,
  IllegalMoveError,
  createBoard,
  dropPiece,
  gameState,
  isColumnInRange,
  winningLineThrough,
  type Board,
  type GameState,
  type Player,
} from "../rules/index.js";

export interface ApiRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  /** Cuerpo JSON ya parseado; `INVALID_JSON` si no se pudo. */
  body: unknown;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

export const INVALID_JSON = Symbol("invalid-json");

export interface ApiDeps {
  /** Reloj para el presupuesto de búsqueda (performance.now en producción). */
  now: () => number;
  /** URL pública del árbitro para el replay; sin ella, /replay responde 503. */
  arbiterUrl?: string;
  fetch?: (url: string) => Promise<Response>;
  /** Presupuesto por defecto para la jugada del bot en la web. */
  defaultBudgetMs?: number;
}

/** Estado que recibe el frontend: todo lo que necesita para dibujar, sin calcular reglas. */
export interface StateBody extends GameState {
  moves: number[];
  board: Board;
}

export const BUDGET_LIMITS = { min: 50, max: 2500 } as const;
const MAX_DEPTH_LIMITS = { min: 1, max: 42 } as const;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const ok = (body: unknown): ApiResponse => ({ status: 200, body });

/**
 * Reconstruye el tablero desde `moves` validando cada jugada.
 * Rechaza columnas fuera de rango, columnas llenas y jugadas después de que alguien ganó.
 */
export function replayMoves(raw: unknown): { moves: number[]; board: Board } {
  if (!Array.isArray(raw)) throw new HttpError(400, "validation", "moves debe ser una lista de columnas (0 a 7).");
  if (raw.length > CELLS) throw new HttpError(400, "validation", `moves tiene más de ${CELLS} jugadas.`);
  let board = createBoard();
  for (let i = 0; i < raw.length; i++) {
    const col: unknown = raw[i];
    if (!isColumnInRange(col)) throw new HttpError(400, "validation", `moves[${i}] = ${JSON.stringify(col)} no es una columna de 0 a ${COLS - 1}.`);
    const player: Player = i % 2 === 0 ? 1 : 2;
    try {
      const drop = dropPiece(board, col, player);
      board = drop.board;
      if (winningLineThrough(board, drop.row, col) && i < raw.length - 1) {
        throw new HttpError(400, "validation", `La partida terminó en la jugada ${i + 1}; moves no puede seguir.`);
      }
    } catch (err) {
      if (err instanceof IllegalMoveError) throw new HttpError(400, "validation", `moves[${i}]: ${err.message}`);
      throw err;
    }
  }
  return { moves: raw as number[], board };
}

export function stateBody(moves: number[], board: Board): StateBody {
  return { moves, board, ...gameState(board) };
}

function requirePlaying(state: StateBody): asserts state is StateBody & { nextPlayer: Player } {
  if (state.status !== "playing" || state.nextPlayer === null) {
    throw new HttpError(400, "game_over", "La partida ya terminó. Empieza una nueva.");
  }
}

function clampInt(value: unknown, limits: { min: number; max: number }, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new HttpError(400, "validation", `${name} debe ser un número.`);
  return Math.min(Math.max(Math.round(value), limits.min), limits.max);
}

// ───────────────────────────── Rutas ─────────────────────────────

function postState(body: unknown): ApiResponse {
  const { moves, board } = replayMoves(isRecord(body) ? body.moves : undefined);
  return ok(stateBody(moves, board));
}

function postPlay(body: unknown): ApiResponse {
  if (!isRecord(body)) throw new HttpError(400, "validation", "El cuerpo debe ser { moves, column }.");
  const { moves, board } = replayMoves(body.moves);
  requirePlaying(stateBody(moves, board));
  const column = body.column;
  if (!isColumnInRange(column)) {
    throw new HttpError(400, "illegal_move", `La columna ${JSON.stringify(column)} no existe (0 a ${COLS - 1}).`);
  }
  const player: Player = moves.length % 2 === 0 ? 1 : 2;
  try {
    const next = dropPiece(board, column, player).board;
    return ok(stateBody([...moves, column], next));
  } catch (err) {
    if (err instanceof IllegalMoveError) throw new HttpError(400, "illegal_move", err.message);
    throw err;
  }
}

function postBotMove(body: unknown, deps: ApiDeps): ApiResponse {
  if (!isRecord(body)) throw new HttpError(400, "validation", "El cuerpo debe ser { moves, budgetMs?, maxDepth? }.");
  const { moves, board } = replayMoves(body.moves);
  const before = stateBody(moves, board);
  requirePlaying(before);
  const budgetMs = clampInt(body.budgetMs, BUDGET_LIMITS, "budgetMs") ?? deps.defaultBudgetMs ?? 1000;
  const maxDepth = clampInt(body.maxDepth, MAX_DEPTH_LIMITS, "maxDepth");
  const decision = chooseMove(board, before.nextPlayer, before.legalMoves, {
    budgetMs,
    now: deps.now,
    ...(maxDepth === undefined ? {} : { maxDepth }),
  });
  const next = dropPiece(board, decision.column, before.nextPlayer).board;
  const result: { column: number; state: StateBody; stats: MoveStats } = {
    column: decision.column,
    state: stateBody([...moves, decision.column], next),
    stats: decision.stats,
  };
  return ok(result);
}

async function proxyArbiter(path: string, deps: ApiDeps): Promise<ApiResponse> {
  if (!deps.arbiterUrl) throw new HttpError(503, "arbiter_not_configured", "Falta ARBITRO_URL para consultar partidas del torneo.");
  const fetchFn = deps.fetch ?? ((url: string) => globalThis.fetch(url));
  let res: Response;
  try {
    res = await fetchFn(`${deps.arbiterUrl.replace(/\/+$/, "")}${path}`);
  } catch {
    throw new HttpError(502, "arbiter_unreachable", "No se pudo contactar al árbitro.");
  }
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(502, "arbiter_bad_response", "El árbitro respondió algo que no es JSON.");
  }
  return { status: res.status, body };
}

/** Punto único de entrada de la API. Nunca lanza: los errores salen como { ok: false, error, message }. */
export async function handleApi(req: ApiRequest, deps: ApiDeps): Promise<ApiResponse> {
  try {
    if (req.body === INVALID_JSON) throw new HttpError(400, "validation", "JSON inválido.");
    const { method, path } = req;

    if (method === "GET" && path === "/api/v1/health") return ok({ ok: true });
    if (method === "POST" && path === "/api/v1/state") return postState(req.body);
    if (method === "POST" && path === "/api/v1/play") return postPlay(req.body);
    if (method === "POST" && path === "/api/v1/bot-move") return postBotMove(req.body, deps);

    // Replay de partidas del torneo (opcional en PLAN_FRONTEND.md). Proxy a las rutas públicas del árbitro para evitar CORS.
    if (method === "GET" && path === "/api/v1/games") {
      const params = new URLSearchParams();
      for (const key of ["kind", "limit"]) {
        const v = req.query.get(key);
        if (v !== null) params.set(key, v);
      }
      const qs = params.toString();
      return await proxyArbiter(`/api/games${qs ? `?${qs}` : ""}`, deps);
    }
    const replay = path.match(/^\/api\/v1\/replay\/([^/]+)$/);
    if (method === "GET" && replay?.[1]) return await proxyArbiter(`/api/games/${encodeURIComponent(decodeURIComponent(replay[1]))}`, deps);

    throw new HttpError(404, "not_found", `No existe ${method} ${path}.`);
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, body: { ok: false, error: err.code, message: err.message } };
    return { status: 500, body: { ok: false, error: "internal", message: "Error interno de la API." } };
  }
}

