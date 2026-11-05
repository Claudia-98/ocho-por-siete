import type { Board, GameState } from "../src/game/model";
import { initialState, type UiState } from "../src/game/reducer";

export const emptyBoard = (): Board => Array.from({ length: 7 }, () => [0, 0, 0, 0, 0, 0, 0, 0]);

/** Estado de la API para una lista de jugadas sin ganador (solo para pruebas: no valida reglas). */
export function gameFrom(moves: number[], over: Partial<GameState> = {}): GameState {
  const board = emptyBoard();
  moves.forEach((col, i) => {
    const row = board.findIndex((r) => r[col] === 0);
    board[row]![col] = i % 2 === 0 ? 1 : 2;
  });
  return {
    moves,
    board,
    status: "playing",
    nextPlayer: moves.length % 2 === 0 ? 1 : 2,
    winner: null,
    winningCells: [],
    legalMoves: [0, 1, 2, 3, 4, 5, 6, 7],
    ...over,
  };
}

export const ui = (over: Partial<UiState> = {}): UiState => ({ ...initialState, ...over });
