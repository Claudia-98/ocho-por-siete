import { CELLS, COLS, CONNECT, ROWS, type Board, type Coord, type GameState, type Player } from "./types.js";
import { cellAt, countPieces, isColumnFull, playerToMove } from "./board.js";

/** Las cuatro direcciones de victoria, como [Δfila, Δcolumna]. */
export const DIRECTIONS = {
  horizontal: [0, 1],
  vertical: [1, 0],
  diagonalUp: [1, 1], // ↗
  diagonalDown: [-1, 1], // ↘
} as const satisfies Record<string, readonly [number, number]>;

const DIRECTION_LIST = Object.values(DIRECTIONS);

/** Columnas que aún no están llenas, de izquierda a derecha. */
export function legalMoves(board: Board): number[] {
  const moves: number[] = [];
  for (let col = 0; col < COLS; col++) {
    if (!isColumnFull(board, col)) moves.push(col);
  }
  return moves;
}

/**
 * Línea ganadora que pasa por la casilla (row, col), o `null`.
 * Devuelve todas las fichas consecutivas de esa línea (4 o más), de un extremo al otro.
 * Es la forma rápida de revisar después de una jugada: solo mira la ficha que cayó.
 */
export function winningLineThrough(board: Board, row: number, col: number): Coord[] | null {
  const player = cellAt(board, row, col);
  if (player === 0) return null;

  for (const [dr, dc] of DIRECTION_LIST) {
    const line: Coord[] = [[row, col]];
    // Hacia atrás
    for (let r = row - dr, c = col - dc; cellAt(board, r, c) === player; r -= dr, c -= dc) {
      line.unshift([r, c]);
    }
    // Hacia adelante
    for (let r = row + dr, c = col + dc; cellAt(board, r, c) === player; r += dr, c += dc) {
      line.push([r, c]);
    }
    if (line.length >= CONNECT) return line;
  }
  return null;
}

export interface Winner {
  player: Player;
  cells: Coord[];
}

/** Busca un cuatro en línea en todo el tablero (sin saber cuál fue la última jugada). */
export function findWinner(board: Board): Winner | null {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cells = winningLineThrough(board, row, col);
      if (cells) return { player: cellAt(board, row, col) as Player, cells };
    }
  }
  return null;
}

export function isFull(board: Board): boolean {
  return countPieces(board) === CELLS;
}

/** Estado completo de la partida: es lo que la API le devuelve a la app web. */
export function gameState(board: Board): GameState {
  const winner = findWinner(board);
  if (winner) {
    return { status: "won", nextPlayer: null, winner: winner.player, winningCells: winner.cells, legalMoves: [] };
  }
  if (isFull(board)) {
    return { status: "draw", nextPlayer: null, winner: null, winningCells: [], legalMoves: [] };
  }
  return {
    status: "playing",
    nextPlayer: playerToMove(board),
    winner: null,
    winningCells: [],
    legalMoves: legalMoves(board),
  };
}
