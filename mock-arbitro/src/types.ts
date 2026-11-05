// Tipos del contrato del árbitro (docs/arbitro-openapi.json v1.0.1), solo lo que usa el mock.
import type { Board, Coord, Player } from "../../backend/src/rules/index.js";

export type Kind = "practice" | "friendly" | "league" | "third_place" | "final";
export type Phase = "practice" | "frozen" | "league" | "playoffs" | "finished";
export type HouseBot = "casa-aleatorio" | "casa-basico";
export const HOUSE_BOTS: readonly HouseBot[] = ["casa-aleatorio", "casa-basico"];

export type ErrorCode =
  | "illegal_move"
  | "timeout"
  | "not_your_turn"
  | "unauthorized"
  | "practice_closed"
  | "submissions_closed"
  | "unknown_game"
  | "validation"
  | "not_found"
  | "internal";

export interface ApiError {
  ok: false;
  error: ErrorCode;
  message: string;
}

export interface Team {
  id: string;
  name: string;
  token: string;
  members: string[];
  /** Equipos de prueba: `standing` es null en /api/me. */
  test?: boolean;
}

export interface PlayerRef {
  team_id: string;
  name: string;
  house?: true;
}

export interface MoveRecord {
  turn: number;
  by: Player;
  column: number;
  ms?: number;
}

export type ResultReason = "connect4" | "draw" | "illegal_move" | "timeout" | "absent" | "admin";

export interface GameResult {
  winner: Player | null;
  reason: ResultReason;
  winning_cells?: Coord[];
  forfeited_by?: Player;
  ms?: number;
  column?: unknown;
  waited_ms?: number;
}

export interface GameSummary {
  game_id: string;
  match_id: string | null;
  kind: Kind;
  series: "third" | "final" | null;
  status: "scheduled" | "playing" | "finished";
  players: { "1": PlayerRef; "2": PlayerRef };
  moves: MoveRecord[];
  current: Player | null;
  result: GameResult | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface Game extends GameSummary {
  board: Board;
}

export interface Turn {
  status: "turn";
  game_id: string;
  match_id: string | null;
  kind: Kind;
  you: Player;
  opponent: string;
  turn: number;
  board: Board;
  moves: number[];
  last_move: { by: Player; column: number } | null;
  legal_moves: number[];
  deadline_ms: number;
  served_at: string;
}

export interface Idle {
  status: "idle";
}

export type MoveResponse =
  | { ok: true; state: "playing" | "won" | "draw"; turn: number; winning_cells?: Coord[] }
  | ApiError;

export interface Submission {
  repo_url: string;
  commit: string;
  registered_at: string;
}
