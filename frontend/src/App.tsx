import { useEffect, useRef } from "react";
import { Board } from "./components/Board";
import { Controls } from "./components/Controls";
import { Disc } from "./components/Disc";
import { MoveHistory } from "./components/MoveHistory";
import { ResultBanner } from "./components/ResultBanner";
import { StatusBar } from "./components/StatusBar";
import { createBoardPlaceholder } from "./game/placeholder";
import { canDrop, describeStats, history, lastMoveCell, roleOf, statusMessage, undoMoves } from "./game/reducer";
import type { Role } from "./game/model";
import { useGame, type GameApi } from "./game/useGame";
import styles from "./App.module.css";

/**
 * Cambio de "Quién abre". Con el tablero vacío la partida empieza de inmediato con el nuevo orden
 * (si abre el bot, juega su primera ficha); con jugadas en curso o una partida terminada solo se
 * guarda la preferencia para la siguiente. Mientras hay una petición pendiente tampoco se reinicia,
 * para que la respuesta del bot no caiga sobre la partida nueva.
 */
export function changeOpener(api: Pick<GameApi, "state" | "newGame" | "setOpener">, opener: Role): void {
  api.setOpener(opener);
  if ((api.state.game?.moves.length ?? 0) === 0 && !api.state.pending) void api.newGame(opener);
}

export function App({ game: injected }: { game?: GameApi } = {}) {
  const own = useGame();
  const { state, newGame, play, undo, retry, setOpener, setDifficulty } = injected ?? own;
  const started = useRef(false);

  // Al abrir la página, empieza una partida (una sola vez, también en StrictMode).
  useEffect(() => {
    if (started.current || injected) return;
    started.current = true;
    void newGame();
  }, [newGame, injected]);

  const g = state.game;
  const board = g?.board ?? createBoardPlaceholder();
  const playable = Array.from({ length: 8 }, (_, c) => c).filter((c) => canDrop(state, c));
  const status = statusMessage(state);
  const finished = g !== null && g.status !== "playing";
  const winnerRole = g?.winner ? roleOf(g.winner, state.humanPlayer) : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Cuatro en línea <span className={styles.size}>8×7</span>
        </h1>
        <p className={styles.team}>Equipo 4: Ocho por Siete</p>
      </header>

      <main className={styles.layout}>
        <div className={styles.boardArea}>
          <Board
            board={board}
            humanPlayer={state.humanPlayer}
            playable={playable}
            winningCells={g?.winningCells ?? []}
            lastMove={lastMoveCell(g)}
            moveCount={g?.moves.length ?? 0}
            onDrop={(c) => void play(c)}
          />
          <p className={styles.legend}>
            <span>
              <Disc role="human" size="icon" /> Tus fichas
            </span>
            <span>
              <Disc role="bot" size="icon" /> Fichas del bot
            </span>
          </p>
        </div>

        <aside className={styles.panel}>
          {g && finished && !state.error ? (
            <ResultBanner winner={winnerRole} moves={g.moves.length} onPlayAgain={() => void newGame()} />
          ) : (
            <StatusBar
              tone={status.tone}
              text={status.text}
              detail={describeStats(state.lastStats)}
              notice={state.notice}
              onRetry={state.error ? () => void retry() : null}
            />
          )}

          <Controls
            opener={state.opener}
            difficulty={state.difficulty}
            inProgress={(g?.moves.length ?? 0) > 0 && !finished}
            canUndo={undoMoves(g, state.humanPlayer) !== null}
            busy={state.pending}
            onNewGame={() => void newGame()}
            onUndo={() => void undo()}
            onOpener={(opener) => changeOpener({ state, newGame, setOpener }, opener)}
            onDifficulty={setDifficulty}
          />

          <MoveHistory entries={history(g, state.humanPlayer)} />
        </aside>
      </main>
    </div>
  );
}
