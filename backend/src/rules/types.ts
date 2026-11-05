/** Número de filas del tablero (0 = abajo, 6 = arriba). */
export const ROWS = 7;
/** Número de columnas del tablero (0 a 7). */
export const COLS = 8;
/** Fichas consecutivas necesarias para ganar. */
export const CONNECT = 4;
/** Total de casillas: si todas están llenas sin ganador, es empate. */
export const CELLS = ROWS * COLS;

/** 1 abrió la partida; 2 respondió. */
export type Player = 1 | 2;
/** 0 vacío, 1 ficha del jugador 1, 2 ficha del jugador 2. */
export type Cell = 0 | Player;
/**
 * Mismo formato que el árbitro: `board[fila][columna]`, fila 0 abajo.
 * 7 filas × 8 columnas.
 */
export type Board = Cell[][];
/** Coordenada `[fila, columna]`, igual que `winning_cells` del árbitro. */
export type Coord = [row: number, col: number];

export type GameStatus = "playing" | "won" | "draw";

export interface GameState {
  status: GameStatus;
  /** Jugador al que le toca; `null` si la partida terminó. */
  nextPlayer: Player | null;
  /** Ganador; `null` si sigue o es empate. */
  winner: Player | null;
  /** Casillas de la línea ganadora; vacío si no hay ganador. */
  winningCells: Coord[];
  /** Columnas que aún no están llenas; vacío si la partida terminó. */
  legalMoves: number[];
}

/** Se lanza al intentar una jugada en una columna llena o fuera de rango. */
export class IllegalMoveError extends Error {
  constructor(
    readonly column: unknown,
    reason: string,
  ) {
    super(reason);
    this.name = "IllegalMoveError";
  }
}
