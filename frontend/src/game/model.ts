// Tipos del contrato con la API (docs/API_WEB.md). El frontend no calcula reglas: todo viene de aquí.

export type Player = 1 | 2;
export type Cell = 0 | Player;
/** board[fila][columna], fila 0 = abajo. */
export type Board = Cell[][];
export type Coord = [row: number, col: number];
export type GameStatus = "playing" | "won" | "draw";

export interface GameState {
  moves: number[];
  board: Board;
  status: GameStatus;
  nextPlayer: Player | null;
  winner: Player | null;
  winningCells: Coord[];
  legalMoves: number[];
}

export interface BotStats {
  depth: number;
  nodes: number;
  ms: number;
  score: number;
  reason: "only-move" | "win-now" | "block" | "search" | "fallback";
}

export interface BotMoveResponse {
  column: number;
  state: GameState;
  stats: BotStats;
}

/** Quién es quién en pantalla. El color va con el rol (tú rojo, bot amarillo), no con quién abrió. */
export type Role = "human" | "bot";

export type Difficulty = "facil" | "normal" | "dificil";

/** Cómo se traduce cada nivel a parámetros de /bot-move. */
export const DIFFICULTY: Record<Difficulty, { label: string; budgetMs: number; maxDepth?: number }> = {
  facil: { label: "Fácil", budgetMs: 300, maxDepth: 2 },
  normal: { label: "Normal", budgetMs: 800, maxDepth: 6 },
  dificil: { label: "Difícil", budgetMs: 1500 },
};

export const ROWS = 7;
export const COLS = 8;
