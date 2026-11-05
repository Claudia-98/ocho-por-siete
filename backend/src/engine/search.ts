// Negamax con poda alfa-beta, tabla de transposición y orden de jugadas.
import { COLS } from "../rules/index.js";
import { evaluate, WEIGHTS, type Weights } from "./evaluate.js";
import type { Position } from "./position.js";
import { Bound, type TranspositionTable } from "./tt.js";

/**
 * Valor de una victoria. Se resta el número de fichas al ganar (`WIN - fichas`), así el bot
 * prefiere ganar rápido y perder tarde. Como depende solo de la posición (no del camino),
 * es seguro guardarlo en la tabla de transposición.
 */
export const WIN = 1_000_000;
export const INF = 2 * WIN;
/** ¿Este valor es una victoria o derrota forzada (y no una evaluación heurística)? */
export const isForced = (score: number): boolean => Math.abs(score) > WIN - 1000;

/** Centro hacia afuera. En 8 columnas el centro son la 3 y la 4. */
export const MOVE_ORDER: readonly number[] = [3, 4, 2, 5, 1, 6, 0, 7];

/** Se lanza dentro de la búsqueda cuando se acaba el tiempo; la iteración en curso se descarta. */
export class TimeUp extends Error {
  constructor() {
    super("Se acabó el tiempo de búsqueda");
  }
}

export interface SearcherOptions {
  /** `null` desactiva la tabla de transposición (útil para comparar en pruebas). */
  tt: TranspositionTable | null;
  /** Reloj inyectado (ms). El motor no llama a Date.now ni a performance.now directamente. */
  now?: () => number;
  /** Instante (según `now`) en que hay que abortar. */
  deadline?: number;
  /** Pesos de la heurística (por defecto `WEIGHTS`). */
  weights?: Weights;
}

/** Cada cuántos nodos se revisa el reloj (potencia de 2 para usar una máscara). */
const CLOCK_MASK = 1023;

export class Searcher {
  nodes = 0;
  private readonly tt: TranspositionTable | null;
  private readonly now: () => number;
  private readonly deadline: number;
  private readonly weights: Weights;

  constructor(
    private readonly pos: Position,
    options: SearcherOptions,
  ) {
    this.tt = options.tt;
    this.now = options.now ?? (() => 0);
    this.deadline = options.deadline ?? Infinity;
    this.weights = options.weights ?? WEIGHTS;
  }

  /**
   * Valor de la posición para el jugador al que le toca, mirando `depth` jugadas.
   * Reglas en cada nodo: tablero lleno → 0; si hay jugada ganadora → WIN − fichas;
   * profundidad 0 → heurística; si no, el máximo de −(valor del hijo).
   */
  negamax(depth: number, alpha: number, beta: number): number {
    const pos = this.pos;
    this.nodes++;
    if ((this.nodes & CLOCK_MASK) === 0 && this.now() > this.deadline) throw new TimeUp();

    if (pos.isFull()) return 0;
    for (const col of MOVE_ORDER) {
      if (pos.isWinningMove(col)) return WIN - (pos.count + 1);
    }
    if (depth === 0) return evaluate(pos, this.weights);

    const alphaOrig = alpha;
    let ttMove = -1;
    if (this.tt) {
      const entry = this.tt.get(pos.hashLo, pos.hashHi);
      if (entry) {
        ttMove = entry.move;
        if (entry.depth >= depth) {
          if (entry.bound === Bound.Exact) return entry.value;
          if (entry.bound === Bound.Lower) alpha = Math.max(alpha, entry.value);
          else beta = Math.min(beta, entry.value);
          if (alpha >= beta) return entry.value;
        }
      }
    }

    let best = -INF;
    let bestMove = -1;
    // Primero la mejor jugada conocida para esta posición, luego del centro hacia afuera.
    for (let k = -1; k < COLS; k++) {
      const col = k === -1 ? ttMove : MOVE_ORDER[k]!;
      if (col < 0 || (k >= 0 && col === ttMove) || !pos.canPlay(col)) continue;
      pos.play(col);
      let score: number;
      try {
        score = -this.negamax(depth - 1, -beta, -alpha);
      } finally {
        pos.undo(col); // también si se acabó el tiempo: la posición queda intacta
      }
      if (score > best) {
        best = score;
        bestMove = col;
      }
      if (best > alpha) alpha = best;
      if (alpha >= beta) break; // poda: el rival nunca permitiría llegar aquí
    }

    if (this.tt) {
      const bound = best <= alphaOrig ? Bound.Upper : best >= beta ? Bound.Lower : Bound.Exact;
      this.tt.set(pos.hashLo, pos.hashHi, depth, best, bound, bestMove);
    }
    return best;
  }

  /** Búsqueda en la raíz restringida a `moves` (en ese orden). Devuelve la mejor jugada y su valor. */
  searchRoot(depth: number, moves: readonly number[]): { move: number; score: number } {
    const pos = this.pos;
    let alpha = -INF;
    let bestMove = moves[0] ?? -1;
    let best = -INF;
    for (const col of moves) {
      if (!pos.canPlay(col)) continue;
      pos.play(col);
      let score: number;
      try {
        score = pos.lastMoveWins(col) ? WIN - pos.count : -this.negamax(depth - 1, -INF, -alpha);
      } finally {
        pos.undo(col);
      }
      if (score > best) {
        best = score;
        bestMove = col;
      }
      if (best > alpha) alpha = best;
    }
    return { move: bestMove, score: best };
  }
}
