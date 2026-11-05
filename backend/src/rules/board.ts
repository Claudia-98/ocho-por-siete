import { COLS, ROWS, IllegalMoveError, type Board, type Cell, type Player } from "./types.js";

/** Tablero vacío de 7 filas × 8 columnas. */
export function createBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(0));
}

/** Copia profunda: las funciones de reglas nunca modifican el tablero que reciben. */
export function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

/** Valor de una casilla; 0 si la coordenada está fuera del tablero. */
export function cellAt(board: Board, row: number, col: number): Cell {
  return board[row]?.[col] ?? 0;
}

export function isColumnInRange(column: unknown): column is number {
  return Number.isInteger(column) && (column as number) >= 0 && (column as number) < COLS;
}

/** Fila donde caería la siguiente ficha en `col`, o `null` si la columna está llena. */
export function landingRow(board: Board, col: number): number | null {
  for (let row = 0; row < ROWS; row++) {
    if (cellAt(board, row, col) === 0) return row;
  }
  return null;
}

export function isColumnFull(board: Board, col: number): boolean {
  return landingRow(board, col) === null;
}

/** Cantidad de fichas en el tablero. */
export function countPieces(board: Board): number {
  let count = 0;
  for (const row of board) for (const cell of row) if (cell !== 0) count++;
  return count;
}

/**
 * A quién le toca según las fichas: si hay las mismas de cada jugador, al 1 (abrió);
 * si no, al 2.
 */
export function playerToMove(board: Board): Player {
  let ones = 0;
  let twos = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell === 1) ones++;
      else if (cell === 2) twos++;
    }
  }
  return ones === twos ? 1 : 2;
}

export interface DropResult {
  board: Board;
  row: number;
  col: number;
}

/**
 * Deja caer una ficha de `player` en `col`. Devuelve un tablero nuevo y la fila donde cayó.
 * Lanza `IllegalMoveError` si la columna está fuera de rango o llena.
 */
export function dropPiece(board: Board, col: number, player: Player): DropResult {
  if (!isColumnInRange(col)) {
    throw new IllegalMoveError(col, `La columna ${String(col)} está fuera de rango (0 a ${COLS - 1}).`);
  }
  const row = landingRow(board, col);
  if (row === null) {
    throw new IllegalMoveError(col, `La columna ${col} está llena.`);
  }
  const next = cloneBoard(board);
  next[row]![col] = player;
  return { board: next, row, col };
}

/**
 * Reconstruye el tablero a partir de la lista de columnas jugadas desde el inicio
 * (el jugador 1 abre y se alternan). Lanza `IllegalMoveError` si alguna jugada es ilegal.
 */
export function boardFromMoves(moves: readonly number[]): Board {
  let board = createBoard();
  moves.forEach((col, index) => {
    const player: Player = index % 2 === 0 ? 1 : 2;
    board = dropPiece(board, col, player).board;
  });
  return board;
}

/** Valida que un valor desconocido (p. ej. JSON del árbitro) sea un tablero 7×8 válido. */
export function isBoard(value: unknown): value is Board {
  return (
    Array.isArray(value) &&
    value.length === ROWS &&
    value.every(
      (row) =>
        Array.isArray(row) &&
        row.length === COLS &&
        row.every((cell) => cell === 0 || cell === 1 || cell === 2),
    )
  );
}
