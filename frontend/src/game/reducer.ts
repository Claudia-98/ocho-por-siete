// Estado de la interfaz y selectores. Funciones puras: se prueban sin navegador.
import { DIFFICULTY, ROWS, type BotStats, type Coord, type Difficulty, type GameState, type Player, type Role } from "./model";

export type RetryAction = "new" | "bot" | "play";

export interface UiState {
  game: GameState | null;
  /** 1 si abre la persona, 2 si abre el bot. */
  humanPlayer: Player;
  opener: Role;
  difficulty: Difficulty;
  /** Hay una petición en curso: el tablero no acepta clics. */
  pending: boolean;
  /** La petición en curso es la jugada del bot. */
  thinking: boolean;
  /** Error que impide seguir (p. ej. sin conexión); se ofrece reintentar. */
  error: { message: string; retry: RetryAction; column?: number } | null;
  /** Aviso que no rompe la partida (p. ej. columna llena). */
  notice: string | null;
  lastStats: BotStats | null;
}

export type Action =
  | { type: "configure"; opener?: Role; difficulty?: Difficulty }
  | { type: "start"; opener: Role }
  | { type: "request"; thinking: boolean }
  | { type: "loaded"; game: GameState }
  | { type: "botMoved"; game: GameState; stats: BotStats }
  | { type: "failed"; message: string; retry: RetryAction; column?: number }
  | { type: "notice"; message: string };

export const initialState: UiState = {
  game: null,
  humanPlayer: 1,
  opener: "human",
  difficulty: "normal",
  pending: false,
  thinking: false,
  error: null,
  notice: null,
  lastStats: null,
};

export function reducer(state: UiState, action: Action): UiState {
  switch (action.type) {
    case "configure":
      return { ...state, opener: action.opener ?? state.opener, difficulty: action.difficulty ?? state.difficulty };
    case "start":
      return {
        ...state,
        opener: action.opener,
        humanPlayer: action.opener === "human" ? 1 : 2,
        game: null,
        lastStats: null,
        error: null,
        notice: null,
      };
    case "request":
      return { ...state, pending: true, thinking: action.thinking, error: null, notice: null };
    case "loaded":
      return { ...state, game: action.game, pending: false, thinking: false };
    case "botMoved":
      return { ...state, game: action.game, lastStats: action.stats, pending: false, thinking: false };
    case "failed":
      return {
        ...state,
        pending: false,
        thinking: false,
        error: { message: action.message, retry: action.retry, ...(action.column === undefined ? {} : { column: action.column }) },
      };
    case "notice":
      return { ...state, pending: false, thinking: false, notice: action.message };
  }
}

// ───────────────────────────── Selectores ─────────────────────────────

export const roleOf = (player: Player, humanPlayer: Player): Role => (player === humanPlayer ? "human" : "bot");

export function isHumanTurn(s: UiState): boolean {
  return s.game?.status === "playing" && s.game.nextPlayer === s.humanPlayer;
}

export function isBotTurn(s: UiState): boolean {
  return s.game?.status === "playing" && s.game.nextPlayer !== null && s.game.nextPlayer !== s.humanPlayer;
}

/** ¿Se puede soltar una ficha en esta columna ahora mismo? */
export function canDrop(s: UiState, col: number): boolean {
  return !s.pending && !s.error && isHumanTurn(s) && (s.game?.legalMoves.includes(col) ?? false);
}

/** Casilla de la última ficha (para animar su caída). */
export function lastMoveCell(game: GameState | null): Coord | null {
  if (!game || game.moves.length === 0) return null;
  const col = game.moves[game.moves.length - 1]!;
  for (let row = ROWS - 1; row >= 0; row--) {
    if (game.board[row]?.[col] !== 0) return [row, col];
  }
  return null;
}

export type Tone = "idle" | "turn" | "thinking" | "won" | "lost" | "draw" | "error";

/** Texto principal de la barra de estado. */
export function statusMessage(s: UiState): { tone: Tone; text: string } {
  if (s.error) return { tone: "error", text: s.error.message };
  const g = s.game;
  if (!g) return { tone: "idle", text: s.pending ? "Preparando el tablero" : "Elige quién abre y empieza una partida." };
  if (g.status === "won") {
    return g.winner === s.humanPlayer ? { tone: "won", text: "Ganaste. Hiciste cuatro en línea." } : { tone: "lost", text: "Ganó el bot." };
  }
  if (g.status === "draw") return { tone: "draw", text: "Empate: se llenó el tablero sin cuatro en línea." };
  if (s.thinking || isBotTurn(s)) return { tone: "thinking", text: "El bot está pensando" };
  return { tone: "turn", text: "Tu turno. Elige una columna." };
}

/** Explicación corta de la última jugada del bot, para quien quiera ver "qué pensó". */
export function describeStats(stats: BotStats | null): string | null {
  if (!stats) return null;
  switch (stats.reason) {
    case "win-now":
      return "El bot vio que podía ganar en esa jugada.";
    case "block":
      return "El bot bloqueó tu cuatro en línea.";
    case "only-move":
      return "Era la única columna disponible.";
    case "fallback":
      return "El bot eligió una jugada segura.";
    case "search": {
      const nodes = stats.nodes >= 1_000_000 ? `${(stats.nodes / 1_000_000).toFixed(1)} millones de` : stats.nodes.toLocaleString("es-GT");
      const time = stats.ms < 100 ? "en un instante" : `en ${(stats.ms / 1000).toFixed(1)} s`;
      return `El bot miró ${stats.depth} jugadas adelante: ${nodes} posiciones ${time}.`;
    }
  }
}

export interface HistoryEntry {
  turn: number;
  role: Role;
  /** Columna como la ve una persona: 1 a 8. */
  column: number;
}

export function history(game: GameState | null, humanPlayer: Player): HistoryEntry[] {
  if (!game) return [];
  return game.moves.map((col, i) => ({ turn: i + 1, role: roleOf(i % 2 === 0 ? 1 : 2, humanPlayer), column: col + 1 }));
}

/**
 * Jugadas que quedan al deshacer: quita la última jugada de la persona (y la respuesta del bot
 * si ya la hubo), para que vuelva a ser su turno. `null` si no hay nada que deshacer.
 */
export function undoMoves(game: GameState | null, humanPlayer: Player): number[] | null {
  if (!game) return null;
  const moves = [...game.moves];
  const nextAfter = (n: number): Player => (n % 2 === 0 ? 1 : 2);
  const humanMoved = moves.some((_, i) => nextAfter(i) === humanPlayer);
  if (!humanMoved) return null;
  moves.pop();
  while (moves.length > 0 && nextAfter(moves.length) !== humanPlayer) moves.pop();
  return moves;
}

export function difficultyParams(d: Difficulty): { budgetMs: number; maxDepth?: number } {
  const { budgetMs, maxDepth } = DIFFICULTY[d];
  return maxDepth === undefined ? { budgetMs } : { budgetMs, maxDepth };
}
