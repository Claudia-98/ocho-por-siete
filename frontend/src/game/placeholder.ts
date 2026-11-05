import { COLS, ROWS, type Board } from "./model";

/** Tablero vacío para dibujar mientras llega la primera respuesta de la API (no aplica reglas). */
export function createBoardPlaceholder(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0) as Board[number]);
}
