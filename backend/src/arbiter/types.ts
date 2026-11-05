// Tipos del árbitro (docs/arbitro-openapi.json v1.0.1) y su validación.
// AGENTS.md: los tipos del árbitro viven solo aquí. Si cambia el OpenAPI, se cambia este archivo.
import { isBoard, isColumnInRange, type Board, type Coord, type Player } from "../rules/index.js";

export type Kind = "practice" | "friendly" | "league" | "third_place" | "final";

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

export type NextResponse = Turn | Idle;

export interface MoveAccepted {
  ok: true;
  state: "playing" | "won" | "draw";
  turn?: number;
  winning_cells?: Coord[];
}

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
  error: ErrorCode | string;
  message?: string;
}

/** La respuesta del árbitro no tiene la forma que dice el OpenAPI. */
export class ProtocolError extends Error {
  constructor(
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ProtocolError";
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isPlayer = (v: unknown): v is Player => v === 1 || v === 2;
const isColumnList = (v: unknown): v is number[] => Array.isArray(v) && v.every(isColumnInRange);

/**
 * Valida la respuesta de GET /api/next. Solo exige lo que el bot necesita para jugar
 * (game_id, you, board, legal_moves); el resto se toma con valores seguros si falta,
 * para no perder un turno por un campo informativo.
 */
export function parseNextResponse(body: unknown): NextResponse {
  if (!isRecord(body)) throw new ProtocolError("La respuesta de /api/next no es un objeto.", body);
  if (body.status === "idle") return { status: "idle" };
  if (body.status !== "turn") throw new ProtocolError(`status desconocido: ${JSON.stringify(body.status)}.`, body);

  if (typeof body.game_id !== "string" || body.game_id === "") throw new ProtocolError("Falta game_id.", body);
  if (!isPlayer(body.you)) throw new ProtocolError("you debe ser 1 o 2.", body);
  if (!isBoard(body.board)) throw new ProtocolError("board no es un tablero de 7 filas × 8 columnas.", body);
  if (!isColumnList(body.legal_moves)) throw new ProtocolError("legal_moves no es una lista de columnas 0–7.", body);

  const lastMove = body.last_move;
  return {
    status: "turn",
    game_id: body.game_id,
    match_id: typeof body.match_id === "string" ? body.match_id : null,
    kind: (typeof body.kind === "string" ? body.kind : "practice") as Kind,
    you: body.you,
    opponent: typeof body.opponent === "string" ? body.opponent : "?",
    turn: typeof body.turn === "number" ? body.turn : 0,
    board: body.board,
    moves: isColumnList(body.moves) ? body.moves : [],
    last_move:
      isRecord(lastMove) && isPlayer(lastMove.by) && isColumnInRange(lastMove.column)
        ? { by: lastMove.by, column: lastMove.column }
        : null,
    legal_moves: body.legal_moves,
    deadline_ms: typeof body.deadline_ms === "number" ? body.deadline_ms : 3000,
    served_at: typeof body.served_at === "string" ? body.served_at : "",
  };
}

export function isApiError(body: unknown): body is ApiError {
  return isRecord(body) && body.ok === false && typeof body.error === "string";
}

export function parseMoveAccepted(body: unknown): MoveAccepted {
  if (!isRecord(body) || body.ok !== true) throw new ProtocolError("Respuesta de /api/move sin ok: true.", body);
  const state = body.state;
  if (state !== "playing" && state !== "won" && state !== "draw") throw new ProtocolError(`state desconocido: ${JSON.stringify(state)}.`, body);
  return {
    ok: true,
    state,
    ...(typeof body.turn === "number" ? { turn: body.turn } : {}),
    ...(Array.isArray(body.winning_cells) ? { winning_cells: body.winning_cells as Coord[] } : {}),
  };
}
