// Núcleo del mock del árbitro: partidas, turnos, long polling y tiempos.
// No sabe nada de HTTP; el reloj, los timers y el azar se inyectan para poder probarlo.
import {
  COLS,
  createBoard,
  dropPiece,
  isColumnFull,
  isColumnInRange,
  isFull,
  legalMoves,
  winningLineThrough,
  type Board,
  type Player,
} from "../../backend/src/rules/index.js";
import { houseMove, type Random } from "./house.js";
import {
  HOUSE_BOTS,
  type ApiError,
  type ErrorCode,
  type Game,
  type GameResult,
  type GameSummary,
  type HouseBot,
  type Idle,
  type Kind,
  type MoveResponse,
  type Phase,
  type PlayerRef,
  type Submission,
  type Team,
  type Turn,
} from "./types.js";

export interface Scheduler {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realScheduler: Scheduler = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface ArbiterOptions {
  teams: Team[];
  /** Tiempo por jugada desde served_at (3,000 ms en el árbitro real). */
  deadlineMs?: number;
  /** Tiempo máximo que un turno espera a ser recogido antes de perder por ausencia (30 s). */
  absentMs?: number;
  /**
   * Si un bot recoge el turno y nunca responde, la partida se da por perdida por tiempo
   * `deadlineMs + timeoutGraceMs` después de servirlo. Antes de eso, una jugada tardía
   * recibe `400 timeout`, como en el árbitro real.
   */
  timeoutGraceMs?: number;
  /** Retraso antes de que juegue el bot de la casa. */
  houseDelayMs?: number;
  phase?: Phase;
  scheduler?: Scheduler;
  random?: Random;
  /** Una línea por evento de partida. */
  log?: (line: string) => void;
}

export class ArbiterError extends Error {
  readonly body: ApiError;
  constructor(
    readonly status: number,
    error: ErrorCode,
    message: string,
  ) {
    super(message);
    this.body = { ok: false, error, message };
  }
}

type Seat = { kind: "team"; team: Team } | { kind: "house"; bot: HouseBot };

interface InternalGame {
  summary: GameSummary;
  board: Board;
  seats: Record<Player, Seat>;
  createdSeq: number;
  /** Cuándo quedó disponible el turno actual (para la ausencia y para elegir el más antiguo). */
  availableAt: number | null;
  /** Cuándo se le entregó el turno al bot (desde aquí corre deadline_ms). */
  servedAt: number | null;
  timer: unknown;
}

interface Waiter {
  resolve: (value: Turn | Idle) => void;
  timer: unknown;
}

export interface NextHandle {
  promise: Promise<Turn | Idle>;
  /** Llamar si el cliente cerró la conexión: así el turno no se le entrega a nadie. */
  cancel: () => void;
}

const other = (p: Player): Player => (p === 1 ? 2 : 1);
const MAX_WAIT_S = 25;
const DEFAULT_WAIT_S = 20;
const REPO_PATTERN = /^https?:\/\/(github\.com|bitbucket\.org)\/.+/;
const COMMIT_PATTERN = /^[0-9a-fA-F]{7,40}$/;
const KINDS: readonly Kind[] = ["practice", "friendly", "league", "third_place", "final"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class Arbiter {
  readonly deadlineMs: number;
  private readonly absentMs: number;
  private readonly timeoutGraceMs: number;
  private readonly houseDelayMs: number;
  private readonly scheduler: Scheduler;
  private readonly random: Random;
  private readonly log: (line: string) => void;
  private readonly teams: Team[];
  private readonly games = new Map<string, InternalGame>();
  private readonly waiters = new Map<string, Waiter[]>();
  private readonly submissions = new Map<string, Submission>();
  private seq = 0;
  phase: Phase;

  constructor(options: ArbiterOptions) {
    this.teams = options.teams;
    this.deadlineMs = options.deadlineMs ?? 3000;
    this.absentMs = options.absentMs ?? 30_000;
    this.timeoutGraceMs = options.timeoutGraceMs ?? 5000;
    this.houseDelayMs = options.houseDelayMs ?? 0;
    this.phase = options.phase ?? "practice";
    this.scheduler = options.scheduler ?? realScheduler;
    this.random = options.random ?? Math.random;
    this.log = options.log ?? (() => {});
  }

  // ───────────────────────────── Autenticación ─────────────────────────────

  authenticate(authorization: string | undefined): Team {
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    const team = token ? this.teams.find((t) => t.token === token) : undefined;
    if (!team) throw new ArbiterError(401, "unauthorized", "Token inválido.");
    return team;
  }

  // ───────────────────────────── Crear partidas ─────────────────────────────

  createPractice(team: Team, body: unknown): { game_id: string; you: Player } {
    if (this.phase !== "practice") {
      throw new ArbiterError(423, "practice_closed", "Las prácticas cerraron a las 09:45.");
    }
    const input = isRecord(body) ? body : {};
    const opponent = input.opponent ?? "casa-basico";
    const first = input.first ?? 1;
    if (typeof opponent !== "string" || !HOUSE_BOTS.includes(opponent as HouseBot)) {
      throw new ArbiterError(400, "validation", `Rival inválido: ${String(opponent)}.`);
    }
    if (first !== 1 && first !== 2) {
      throw new ArbiterError(400, "validation", `first inválido: ${String(first)}. Debe ser 1 o 2.`);
    }
    const teamSeat: Seat = { kind: "team", team };
    const houseSeat: Seat = { kind: "house", bot: opponent as HouseBot };
    const seats: Record<Player, Seat> = first === 1 ? { 1: teamSeat, 2: houseSeat } : { 1: houseSeat, 2: teamSeat };
    const game = this.createGame("practice", null, seats, "p");
    return { game_id: game.summary.game_id, you: first };
  }

  /** Solo del mock: amistoso entre dos equipos (puede ser el mismo equipo contra sí mismo). */
  createFriendly(team1Id: unknown, team2Id: unknown): { game_id: string } {
    const t1 = this.teams.find((t) => t.id === team1Id);
    const t2 = this.teams.find((t) => t.id === team2Id);
    if (!t1 || !t2) throw new ArbiterError(400, "validation", "team1 y team2 deben ser ids de equipos del mock.");
    const game = this.createGame("friendly", "amistoso", { 1: { kind: "team", team: t1 }, 2: { kind: "team", team: t2 } }, "f");
    return { game_id: game.summary.game_id };
  }

  private createGame(kind: Kind, matchId: string | null, seats: Record<Player, Seat>, prefix: string): InternalGame {
    this.seq += 1;
    const game: InternalGame = {
      summary: {
        game_id: `g_${prefix}_${String(this.seq).padStart(2, "0")}`,
        match_id: matchId,
        kind,
        series: null,
        status: "playing",
        players: { "1": this.playerRef(seats[1]), "2": this.playerRef(seats[2]) },
        moves: [],
        current: 1,
        result: null,
        started_at: this.isoNow(),
        finished_at: null,
      },
      board: createBoard(),
      seats,
      createdSeq: this.seq,
      availableAt: null,
      servedAt: null,
      timer: null,
    };
    this.games.set(game.summary.game_id, game);
    this.log(`${game.summary.game_id} creada (${kind}): ${game.summary.players["1"].name} vs ${game.summary.players["2"].name}`);
    this.startTurn(game);
    return game;
  }

  // ───────────────────────────── Ciclo del bot ─────────────────────────────

  /** GET /api/next — long polling. */
  next(team: Team, waitParam?: unknown): NextHandle {
    const wait = this.parseWait(waitParam);
    const pending = this.oldestPendingFor(team);
    if (pending) return { promise: Promise.resolve(this.serve(pending)), cancel: () => {} };
    if (wait === 0) return { promise: Promise.resolve({ status: "idle" }), cancel: () => {} };

    let waiter!: Waiter;
    const promise = new Promise<Turn | Idle>((resolve) => {
      waiter = { resolve, timer: null };
      waiter.timer = this.scheduler.setTimeout(() => {
        this.removeWaiter(team.id, waiter);
        resolve({ status: "idle" });
      }, wait * 1000);
    });
    const list = this.waiters.get(team.id) ?? [];
    list.push(waiter);
    this.waiters.set(team.id, list);
    return {
      promise,
      cancel: () => {
        this.scheduler.clearTimeout(waiter.timer);
        this.removeWaiter(team.id, waiter);
      },
    };
  }

  /** POST /api/move. Devuelve el código HTTP y el cuerpo. */
  move(team: Team, body: unknown): { status: number; body: MoveResponse } {
    if (!isRecord(body) || typeof body.game_id !== "string") {
      throw new ArbiterError(400, "validation", "El cuerpo debe ser { game_id: string, column: number }.");
    }
    const game = this.games.get(body.game_id);
    if (!game) throw new ArbiterError(409, "unknown_game", `La partida ${body.game_id} no existe.`);
    const player = game.summary.current;
    if (game.summary.status !== "playing" || player === null || !this.isTeamSeat(game.seats[player], team)) {
      throw new ArbiterError(409, "not_your_turn", `La partida ${body.game_id} no tiene un turno pendiente para tu equipo.`);
    }

    const servedAt = game.servedAt ?? this.serveTimestamp(game);
    const ms = this.scheduler.now() - servedAt;
    if (ms > this.deadlineMs) {
      this.forfeit(game, player, "timeout", { ms });
      return this.error(400, "timeout", `La jugada llegó ${ms - this.deadlineMs} ms después del límite.`);
    }

    const column = body.column;
    if (!isColumnInRange(column)) {
      this.forfeit(game, player, "illegal_move", { ms, column });
      return this.error(400, "illegal_move", `La columna ${JSON.stringify(column)} está fuera de rango (0 a ${COLS - 1}).`);
    }
    if (isColumnFull(game.board, column)) {
      this.forfeit(game, player, "illegal_move", { ms, column });
      return this.error(400, "illegal_move", `La columna ${column} está llena.`);
    }

    this.applyMove(game, column, ms);
    const s = game.summary;
    if (s.status === "finished") {
      const won = s.result?.reason === "connect4";
      return {
        status: 200,
        body: won
          ? { ok: true, state: "won", turn: s.moves.length, winning_cells: s.result?.winning_cells ?? [] }
          : { ok: true, state: "draw", turn: s.moves.length },
      };
    }
    return { status: 200, body: { ok: true, state: "playing", turn: s.moves.length + 1 } };
  }

  // ───────────────────────────── Equipo y público ─────────────────────────────

  me(team: Team) {
    return {
      team: { id: team.id, name: team.name, members: team.members },
      standing: team.test ? null : { position: this.leagueTeams().indexOf(team) + 1, played: 0, won: 0, drawn: 0, lost: 0, points: 0 },
      pending_turns: [...this.games.values()]
        .filter((g) => g.summary.current !== null && this.isTeamSeat(g.seats[g.summary.current], team))
        .map((g) => g.summary.game_id),
      submission: this.submissions.get(team.id) ?? null,
      phase: this.phase,
    };
  }

  submit(team: Team, body: unknown): Submission {
    if (this.phase !== "practice") throw new ArbiterError(423, "submissions_closed", "Las entregas cerraron a las 09:45.");
    if (!isRecord(body) || typeof body.repo_url !== "string" || !REPO_PATTERN.test(body.repo_url)) {
      throw new ArbiterError(400, "validation", "repo_url debe ser un repositorio de GitHub o Bitbucket.");
    }
    if (typeof body.commit !== "string" || !COMMIT_PATTERN.test(body.commit)) {
      throw new ArbiterError(400, "validation", "commit debe ser un hash hexadecimal de 7 a 40 caracteres.");
    }
    const record: Submission = { repo_url: body.repo_url, commit: body.commit, registered_at: this.isoNow() };
    this.submissions.set(team.id, record);
    return record;
  }

  listGames(kindParam?: unknown, limitParam?: unknown): GameSummary[] {
    if (kindParam !== undefined && !KINDS.includes(kindParam as Kind)) {
      throw new ArbiterError(400, "validation", `kind inválido: ${String(kindParam)}.`);
    }
    const parsed = limitParam === undefined ? 50 : Number(limitParam);
    const limit = Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 500) : 50;
    return [...this.games.values()]
      .filter((g) => kindParam === undefined || g.summary.kind === kindParam)
      .sort((a, b) => b.createdSeq - a.createdSeq)
      .slice(0, limit)
      .map((g) => structuredClone(g.summary));
  }

  getGame(id: string): Game {
    const game = this.games.get(id);
    if (!game) throw new ArbiterError(404, "unknown_game", "No existe.");
    return structuredClone({ ...game.summary, board: game.board });
  }

  standings() {
    return {
      phase: this.phase,
      standings: this.leagueTeams().map((team, i) => ({
        position: i + 1,
        team: { id: team.id, name: team.name, members: team.members },
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        points: 0,
      })),
    };
  }

  // ───────────────────────────── Internos ─────────────────────────────

  private startTurn(game: InternalGame): void {
    const player = game.summary.current;
    if (player === null) return;
    const seat = game.seats[player];
    game.availableAt = this.scheduler.now();
    game.servedAt = null;

    if (seat.kind === "house") {
      game.timer = this.scheduler.setTimeout(() => {
        game.timer = null;
        if (game.summary.status !== "playing") return;
        this.applyMove(game, houseMove(seat.bot, game.board, player, this.random));
      }, this.houseDelayMs);
      return;
    }

    game.timer = this.scheduler.setTimeout(() => {
      game.timer = null;
      this.forfeit(game, player, "absent", { waited_ms: this.absentMs });
    }, this.absentMs);

    const waiter = this.waiters.get(seat.team.id)?.shift();
    if (waiter) {
      this.scheduler.clearTimeout(waiter.timer);
      waiter.resolve(this.serve(game));
    }
  }

  /** Entrega el turno: fija served_at (si es la primera vez) y arranca el reloj de la jugada. */
  private serve(game: InternalGame): Turn {
    const player = game.summary.current;
    if (player === null) throw new Error("serve() sin turno pendiente");
    if (game.servedAt === null) this.serveTimestamp(game);
    const servedAt = game.servedAt ?? this.scheduler.now();
    const opponentSeat = game.seats[other(player)];
    const moves = game.summary.moves;
    const last = moves[moves.length - 1];
    return {
      status: "turn",
      game_id: game.summary.game_id,
      match_id: game.summary.match_id,
      kind: game.summary.kind,
      you: player,
      opponent: opponentSeat.kind === "team" ? opponentSeat.team.name : opponentSeat.bot,
      turn: moves.length + 1,
      board: structuredClone(game.board),
      moves: moves.map((m) => m.column),
      last_move: last ? { by: last.by, column: last.column } : null,
      legal_moves: legalMoves(game.board),
      deadline_ms: this.deadlineMs,
      served_at: new Date(servedAt).toISOString(),
    };
  }

  private serveTimestamp(game: InternalGame): number {
    const player = game.summary.current as Player;
    const now = this.scheduler.now();
    game.servedAt = now;
    this.scheduler.clearTimeout(game.timer);
    game.timer = this.scheduler.setTimeout(() => {
      game.timer = null;
      this.forfeit(game, player, "timeout", { ms: this.deadlineMs + this.timeoutGraceMs });
    }, this.deadlineMs + this.timeoutGraceMs);
    return now;
  }

  private applyMove(game: InternalGame, column: number, ms?: number): void {
    const by = game.summary.current as Player;
    this.scheduler.clearTimeout(game.timer);
    game.timer = null;
    const { board, row } = dropPiece(game.board, column, by);
    game.board = board;
    game.summary.moves.push(ms === undefined ? { turn: game.summary.moves.length + 1, by, column } : { turn: game.summary.moves.length + 1, by, column, ms });
    this.log(`${game.summary.game_id} jugada ${game.summary.moves.length}: ${game.summary.players[by].name} → columna ${column}${ms === undefined ? "" : ` (${ms} ms)`}`);

    const line = winningLineThrough(board, row, column);
    if (line) return this.finish(game, { winner: by, reason: "connect4", winning_cells: line });
    if (isFull(board)) return this.finish(game, { winner: null, reason: "draw" });
    game.summary.current = other(by);
    this.startTurn(game);
  }

  private forfeit(game: InternalGame, loser: Player, reason: "timeout" | "illegal_move" | "absent", extra: Partial<GameResult>): void {
    if (game.summary.status !== "playing") return;
    this.finish(game, { winner: other(loser), reason, forfeited_by: loser, ...extra });
  }

  private finish(game: InternalGame, result: GameResult): void {
    this.scheduler.clearTimeout(game.timer);
    game.timer = null;
    game.availableAt = null;
    game.servedAt = null;
    Object.assign(game.summary, { status: "finished", current: null, result, finished_at: this.isoNow() });
    const who = result.winner === null ? "empate" : `gana ${game.summary.players[result.winner].name}`;
    this.log(`${game.summary.game_id} terminó: ${who} (${result.reason})`);
  }

  private oldestPendingFor(team: Team): InternalGame | undefined {
    let best: InternalGame | undefined;
    for (const game of this.games.values()) {
      const p = game.summary.current;
      if (game.summary.status !== "playing" || p === null || game.availableAt === null) continue;
      if (!this.isTeamSeat(game.seats[p], team)) continue;
      if (!best || game.availableAt < (best.availableAt ?? Infinity)) best = game;
    }
    return best;
  }

  private isTeamSeat(seat: Seat, team: Team): boolean {
    return seat.kind === "team" && seat.team.id === team.id;
  }

  private removeWaiter(teamId: string, waiter: Waiter): void {
    const list = this.waiters.get(teamId);
    if (!list) return;
    const i = list.indexOf(waiter);
    if (i >= 0) list.splice(i, 1);
  }

  private parseWait(value: unknown): number {
    if (value === undefined || value === null || value === "") return DEFAULT_WAIT_S;
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_WAIT_S;
    return Math.min(Math.max(Math.floor(n), 0), MAX_WAIT_S);
  }

  private playerRef(seat: Seat): PlayerRef {
    return seat.kind === "team" ? { team_id: seat.team.id, name: seat.team.name } : { team_id: seat.bot, name: seat.bot, house: true };
  }

  private leagueTeams(): Team[] {
    return this.teams.filter((t) => !t.test);
  }

  private isoNow(): string {
    return new Date(this.scheduler.now()).toISOString();
  }

  private error(status: number, error: ErrorCode, message: string): { status: number; body: ApiError } {
    return { status, body: { ok: false, error, message } };
  }
}
