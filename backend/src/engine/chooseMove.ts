// Punto de entrada del algoritmo: lo usan el bot del torneo y la API de la app web.
import { COLS, type Board, type Player } from "../rules/index.js";
import { Position } from "./position.js";
import { isForced, MOVE_ORDER, Searcher, TimeUp, WIN } from "./search.js";
import { TranspositionTable } from "./tt.js";

export type MoveReason = "only-move" | "win-now" | "block" | "search" | "fallback";

export interface MoveStats {
  /** Profundidad completada (0 si no hubo búsqueda). */
  depth: number;
  nodes: number;
  ms: number;
  /** Valor de la jugada para el bot (positivo = bueno). */
  score: number;
  reason: MoveReason;
}

export interface ChooseMoveOptions {
  /** Tiempo máximo de búsqueda en ms (BUDGET_MS, 1,800 por defecto en el bot). */
  budgetMs: number;
  /** Reloj en ms. El bot pasa `performance.now`; las pruebas pueden pasar uno falso. */
  now: () => number;
  /** Límite de profundidad (para pruebas y niveles de dificultad). */
  maxDepth?: number;
  /**
   * Tabla de transposición. Por defecto se usa una compartida entre llamadas (es segura:
   * la clave es la posición completa). `null` la desactiva.
   */
  tt?: TranspositionTable | null;
}

export interface MoveDecision {
  column: number;
  stats: MoveStats;
}

let sharedTT: TranspositionTable | undefined;
const defaultTT = () => (sharedTT ??= new TranspositionTable(20));

/** Si dejamos de iterar pasada esta fracción del presupuesto, casi nunca se desperdicia una iteración a medias. */
const NEXT_ITERATION_FRACTION = 0.5;

/**
 * Elige la columna para `player` en `board`.
 * Garantía: la columna devuelta siempre está en `legalMoves` (si `legalMoves` no está vacío).
 */
export function chooseMove(board: Board, player: Player, legalMoves: readonly number[], options: ChooseMoveOptions): MoveDecision {
  const safeNow = () => {
    try {
      return options.now();
    } catch {
      return start;
    }
  };
  const start: number = (() => {
    try {
      return options.now();
    } catch {
      return 0;
    }
  })();
  const elapsed = () => safeNow() - start;
  const done = (column: number, reason: MoveReason, depth = 0, nodes = 0, score = 0): MoveDecision => ({
    column,
    stats: { depth, nodes, ms: Math.round(elapsed()), score, reason },
  });

  // Red de seguridad: si algo falla, la primera jugada legal del centro hacia afuera.
  const centerFirst = MOVE_ORDER.filter((c) => legalMoves.includes(c));
  const fallback = centerFirst[0] ?? legalMoves[0] ?? 0;

  try {
    const pos = Position.fromBoard(board, player);
    // Solo columnas que el árbitro permite Y que no están llenas en nuestro tablero.
    let allowed = centerFirst.filter((c) => pos.canPlay(c));
    if (allowed.length === 0) allowed = centerFirst; // el tablero del árbitro manda
    if (allowed.length === 0) return done(fallback, "fallback");
    if (allowed.length === 1) return done(allowed[0]!, "only-move");

    // Atajo 1: ganar ya.
    const win = allowed.find((c) => pos.isWinningMove(c));
    if (win !== undefined) return done(win, "win-now", 1, 0, WIN - (pos.count + 1));

    // Atajo 2: bloquear un cuatro inmediato del rival (si hay dos, ya no se puede: decide la búsqueda).
    const threats = pos.winningColumnsFor(player === 1 ? 2 : 1).filter((c) => allowed.includes(c));
    if (threats.length === 1) return done(threats[0]!, "block");

    // Iterative deepening con control de tiempo.
    const searcher = new Searcher(pos, {
      tt: options.tt === undefined ? defaultTT() : options.tt,
      now: options.now,
      deadline: start + options.budgetMs,
    });
    const maxDepth = Math.min(options.maxDepth ?? Infinity, COLS * 7 - pos.count);
    let best: { move: number; score: number } | null = null;
    let depth = 0;
    try {
      for (let d = 1; d <= maxDepth; d++) {
        // La mejor jugada de la iteración anterior se prueba primero.
        const order: number[] = best ? [best.move, ...allowed.filter((c) => c !== best!.move)] : allowed;
        best = searcher.searchRoot(d, order);
        depth = d;
        if (isForced(best.score)) break; // ya se sabe el resultado: buscar más no cambia nada
        if (elapsed() > options.budgetMs * NEXT_ITERATION_FRACTION) break;
      }
    } catch (err) {
      if (!(err instanceof TimeUp)) throw err;
    }
    if (!best) return done(allowed[0]!, "fallback", 0, searcher.nodes);
    return done(best.move, "search", depth, searcher.nodes, best.score);
  } catch {
    return done(fallback, "fallback");
  }
}
