// Heurística: puntúa una posición no terminal desde el punto de vista del jugador al que le toca.
import { COLS, CONNECT, ROWS } from "../rules/index.js";
import { index, type Position } from "./position.js";

/** Pesos de la heurística (PLAN_BACKEND.md §5). Se ajustan con partidas, no a ojo. */
export const WEIGHTS = {
  three: 50, // 3 propias + 1 vacía
  two: 10, // 2 propias + 2 vacías
  oppThree: 60, // 3 del rival + 1 vacía (defender pesa un poco más que atacar)
  oppTwo: 10,
  center: 3, // por ficha propia en las columnas 3 y 4
} as const;

/** Juego de pesos de la heurística. `WEIGHTS` es el que usa el bot del torneo. */
export interface Weights {
  readonly three: number;
  readonly two: number;
  readonly oppThree: number;
  readonly oppTwo: number;
  readonly center: number;
}

/**
 * Todas las ventanas de 4 casillas del tablero 8×7, como índices planos.
 * Horizontales 5×7 = 35, verticales 8×4 = 32, diagonales 2 × (5×4) = 40 → 107.
 */
export const WINDOWS: readonly Int8Array[] = (() => {
  const windows: Int8Array[] = [];
  const add = (r: number, c: number, dr: number, dc: number) => {
    const w = new Int8Array(CONNECT);
    for (let k = 0; k < CONNECT; k++) w[k] = index(r + k * dr, c + k * dc);
    windows.push(w);
  };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c + CONNECT <= COLS; c++) add(r, c, 0, 1);
  for (let r = 0; r + CONNECT <= ROWS; r++) for (let c = 0; c < COLS; c++) add(r, c, 1, 0);
  for (let r = 0; r + CONNECT <= ROWS; r++) for (let c = 0; c + CONNECT <= COLS; c++) add(r, c, 1, 1);
  for (let r = CONNECT - 1; r < ROWS; r++) for (let c = 0; c + CONNECT <= COLS; c++) add(r, c, -1, 1);
  return windows;
})();

const CENTER_COLS = [3, 4] as const;

/**
 * Valor de la posición para `pos.current`: positivo = bueno para quien juega.
 * `weights` permite medir otros pesos sin tocar los del torneo (por defecto `WEIGHTS`).
 */
export function evaluate(pos: Position, weights: Weights = WEIGHTS): number {
  const me = pos.current;
  const cells = pos.cells;
  let score = 0;
  for (const w of WINDOWS) {
    let mine = 0;
    let theirs = 0;
    for (let k = 0; k < CONNECT; k++) {
      const v = cells[w[k]!];
      if (v === me) mine++;
      else if (v !== 0) theirs++;
    }
    if (mine > 0 && theirs > 0) continue; // ventana bloqueada: no sirve a nadie
    if (mine === 3) score += weights.three;
    else if (mine === 2) score += weights.two;
    else if (theirs === 3) score -= weights.oppThree;
    else if (theirs === 2) score -= weights.oppTwo;
  }
  for (const col of CENTER_COLS) {
    for (let row = 0; row < ROWS; row++) {
      const v = cells[index(row, col)];
      if (v === me) score += weights.center;
      else if (v !== 0) score -= weights.center;
    }
  }
  return score;
}
