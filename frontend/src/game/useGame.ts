// Hook con el estado de la partida (AGENTS.md: el estado vive aquí; los componentes solo reciben props).
import { useCallback, useMemo, useReducer, useRef } from "react";
import { ApiError, createClient, type BotClient } from "../api/client";
import type { Difficulty, GameState, Role } from "./model";
import { difficultyParams, initialState, reducer, undoMoves, type UiState } from "./reducer";

const messageOf = (err: unknown) => (err instanceof ApiError ? err.message : "Algo salió mal. Vuelve a intentar.");

export interface GameApi {
  state: UiState;
  newGame: (opener?: Role) => Promise<void>;
  play: (column: number) => Promise<void>;
  undo: () => Promise<void>;
  retry: () => Promise<void>;
  setOpener: (opener: Role) => void;
  setDifficulty: (difficulty: Difficulty) => void;
}

export function useGame(client: BotClient = defaultClient): GameApi {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Siempre la versión más reciente, para las funciones asíncronas.
  const ref = useRef(state);
  ref.current = state;

  /** Pide la jugada del bot si le toca. */
  const botTurn = useCallback(
    async (game: GameState) => {
      const s = ref.current;
      if (game.status !== "playing" || game.nextPlayer === s.humanPlayer) return;
      dispatch({ type: "request", thinking: true });
      try {
        const res = await client.botMove(game.moves, difficultyParams(s.difficulty));
        dispatch({ type: "botMoved", game: res.state, stats: res.stats });
      } catch (err) {
        dispatch({ type: "failed", message: messageOf(err), retry: "bot" });
      }
    },
    [client],
  );

  const load = useCallback(
    async (moves: number[]) => {
      dispatch({ type: "request", thinking: false });
      try {
        const game = await client.state(moves);
        dispatch({ type: "loaded", game });
        ref.current = { ...ref.current, game };
        await botTurn(game);
      } catch (err) {
        dispatch({ type: "failed", message: messageOf(err), retry: "new" });
      }
    },
    [client, botTurn],
  );

  const newGame = useCallback(
    async (opener: Role = ref.current.opener) => {
      dispatch({ type: "start", opener });
      ref.current = { ...ref.current, opener, humanPlayer: opener === "human" ? 1 : 2, game: null };
      await load([]);
    },
    [load],
  );

  const play = useCallback(
    async (column: number) => {
      const s = ref.current;
      const game = s.game;
      if (!game || s.pending || game.status !== "playing" || game.nextPlayer !== s.humanPlayer) return;
      dispatch({ type: "request", thinking: false });
      try {
        const next = await client.play(game.moves, column);
        dispatch({ type: "loaded", game: next });
        ref.current = { ...ref.current, game: next };
        await botTurn(next);
      } catch (err) {
        if (err instanceof ApiError && err.code === "illegal_move") dispatch({ type: "notice", message: err.message });
        else dispatch({ type: "failed", message: messageOf(err), retry: "play", column });
      }
    },
    [client, botTurn],
  );

  const undo = useCallback(async () => {
    const s = ref.current;
    if (s.pending) return;
    const moves = undoMoves(s.game, s.humanPlayer);
    if (moves) await load(moves);
  }, [load]);

  const retry = useCallback(async () => {
    const s = ref.current;
    const e = s.error;
    if (!e) return;
    if (e.retry === "bot" && s.game) {
      await botTurn(s.game);
      return;
    }
    if (e.retry === "play" && s.game && e.column !== undefined) {
      // `play` vuelve a lanzar la petición; su "request" borra el error.
      ref.current = { ...ref.current, pending: false, error: null };
      await play(e.column);
      return;
    }
    await load(s.game?.moves ?? []);
  }, [botTurn, load, play]);

  const setOpener = useCallback((opener: Role) => dispatch({ type: "configure", opener }), []);
  const setDifficulty = useCallback((difficulty: Difficulty) => dispatch({ type: "configure", difficulty }), []);

  return useMemo(
    () => ({ state, newGame, play, undo, retry, setOpener, setDifficulty }),
    [state, newGame, play, undo, retry, setOpener, setDifficulty],
  );
}

const defaultClient = createClient();
