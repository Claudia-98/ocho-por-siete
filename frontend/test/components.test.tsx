// Los componentes se renderizan a HTML con react-dom/server: no hace falta navegador ni DOM simulado.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { App, changeOpener } from "../src/App";
import { Board } from "../src/components/Board";
import { Controls } from "../src/components/Controls";
import { MoveHistory } from "../src/components/MoveHistory";
import { ResultBanner } from "../src/components/ResultBanner";
import { StatusBar } from "../src/components/StatusBar";
import type { Role } from "../src/game/model";
import type { GameApi } from "../src/game/useGame";
import { gameFrom, ui } from "./fixtures";

const count = (html: string, needle: string) => html.split(needle).length - 1;
const noop = () => {};

describe("Board", () => {
  const render = (props: Partial<Parameters<typeof Board>[0]> = {}) =>
    renderToStaticMarkup(
      <Board
        board={gameFrom([]).board}
        humanPlayer={1}
        playable={[0, 1, 2, 3, 4, 5, 6, 7]}
        winningCells={[]}
        lastMove={null}
        moveCount={0}
        onDrop={noop}
        {...props}
      />,
    );

  it("dibuja 8 columnas y 56 casillas", () => {
    const html = render();
    expect(count(html, 'aria-label="Columna ')).toBe(8);
    expect(count(html, "data-cell=")).toBe(56);
  });

  it("la primera ficha aparece en la fila de abajo de su columna", () => {
    const html = render({ board: gameFrom([3]).board });
    // Dentro de cada columna, las casillas van de la fila 0 (abajo) a la 6: la primera es la de abajo.
    const col4 = html.split('aria-label="Columna 4')[1]!.split("</button>")[0]!;
    expect(col4.indexOf('data-cell="1"') < col4.indexOf('data-cell="0"')).toBe(true);
    expect(count(html, 'data-role="human"')).toBe(1);
  });

  it("las fichas del bot y las tuyas se distinguen", () => {
    const html = render({ board: gameFrom([3, 4]).board });
    expect(count(html, 'data-role="human"')).toBe(1);
    expect(count(html, 'data-role="bot"')).toBe(1);
  });

  it("columnas no jugables quedan deshabilitadas y las llenas lo dicen", () => {
    const full = gameFrom([0, 0, 0, 0, 0, 0, 0]).board;
    const html = render({ board: full, playable: [1, 2] });
    expect(html.includes('aria-label="Columna 1: llena" aria-disabled="true"')).toBe(true);
    expect(html.includes('aria-label="Columna 2: 7 espacios libres" aria-disabled="false"')).toBe(true);
    expect(html.includes('aria-label="Columna 4: 7 espacios libres" aria-disabled="true"')).toBe(true);
  });

  it("resalta las casillas ganadoras", () => {
    const board = gameFrom([0, 1, 0, 1, 0, 1, 0]).board;
    const html = render({ board, winningCells: [[0, 0], [1, 0], [2, 0], [3, 0]], playable: [] });
    expect(count(html, 'data-highlight="true"')).toBe(4);
  });

  it("numera las columnas de 1 a 8", () => {
    const html = render();
    expect(html.includes("<span>1</span>") && html.includes("<span>8</span>")).toBe(true);
  });
});

describe("StatusBar", () => {
  it("muestra el texto, el detalle del bot y un aviso", () => {
    const html = renderToStaticMarkup(
      <StatusBar tone="turn" text="Tu turno. Elige una columna." detail="El bot miró 9 jugadas adelante." notice="La columna 3 está llena." onRetry={null} />,
    );
    expect(html.includes("Tu turno. Elige una columna.")).toBe(true);
    expect(html.includes("El bot miró 9 jugadas adelante.")).toBe(true);
    expect(html.includes("La columna 3 está llena.")).toBe(true);
    expect(html.includes('aria-live="polite"')).toBe(true);
  });

  it("mientras el bot piensa no muestra la explicación de su jugada anterior", () => {
    const html = renderToStaticMarkup(<StatusBar tone="thinking" text="El bot está pensando" detail="El bot miró 9 jugadas adelante." notice={null} onRetry={null} />);
    expect(html.includes("El bot miró")).toBe(false);
  });

  it("con error ofrece reintentar", () => {
    const html = renderToStaticMarkup(<StatusBar tone="error" text="No hay conexión con el bot." detail={null} notice={null} onRetry={noop} />);
    expect(html.includes("Reintentar")).toBe(true);
  });
});

describe("ResultBanner", () => {
  it.each([
    ["human", "¡Ganaste!"],
    ["bot", "Ganó el bot"],
    [null, "Empate"],
  ] as Array<["human" | "bot" | null, string]>)("ganador %s → %s", (winner, title) => {
    const html = renderToStaticMarkup(<ResultBanner winner={winner} moves={17} onPlayAgain={noop} />);
    expect(html.includes(title)).toBe(true);
    expect(html.includes("Jugar otra vez")).toBe(true);
  });
});

describe("Controls", () => {
  const render = (over: Partial<Parameters<typeof Controls>[0]> = {}) =>
    renderToStaticMarkup(
      <Controls
        opener="human"
        difficulty="normal"
        inProgress={false}
        canUndo={false}
        busy={false}
        onNewGame={noop}
        onUndo={noop}
        onOpener={noop}
        onDifficulty={noop}
        {...over}
      />,
    );

  it("deshacer se deshabilita si no hay nada que deshacer", () => {
    expect(render().includes("disabled")).toBe(true);
    expect(/<button[^>]*disabled[^>]*>Deshacer/.test(render({ canUndo: true }))).toBe(false);
  });

  it("marca la opción elegida de quién abre y dificultad", () => {
    const html = render({ opener: "bot", difficulty: "dificil" });
    // React no garantiza el orden de los atributos: se busca la etiqueta con ambos.
    const checked = (value: string) => (html.match(/<input[^>]*>/g) ?? []).some((tag) => tag.includes(`value="${value}"`) && tag.includes("checked"));
    expect(checked("bot")).toBe(true);
    expect(checked("dificil")).toBe(true);
    expect(checked("human")).toBe(false);
  });

  it("avisa que quién abre aplica en la siguiente partida", () => {
    expect(render({ inProgress: true }).includes("Se aplica al empezar una nueva partida.")).toBe(true);
  });
});

describe("MoveHistory", () => {
  it("lista las jugadas o invita a empezar", () => {
    expect(renderToStaticMarkup(<MoveHistory entries={[]} />).includes("Todavía no hay jugadas.")).toBe(true);
    const html = renderToStaticMarkup(<MoveHistory entries={[{ turn: 1, role: "human", column: 4 }]} />);
    expect(html.includes("Tú, columna 4")).toBe(true);
  });
});

describe("App", () => {
  const api = (state: ReturnType<typeof ui>): GameApi => ({
    state,
    newGame: async () => {},
    play: async () => {},
    undo: async () => {},
    retry: async () => {},
    setOpener: noop,
    setDifficulty: noop,
  });

  it("en tu turno muestra el tablero y el estado", () => {
    const html = renderToStaticMarkup(<App game={api(ui({ game: gameFrom([]) }))} />);
    expect(html.includes("Cuatro en línea")).toBe(true);
    expect(html.includes("Tu turno")).toBe(true);
    expect(count(html, 'aria-disabled="false"')).toBe(8);
  });

  it("mientras piensa el bot, el tablero no acepta jugadas", () => {
    const html = renderToStaticMarkup(<App game={api(ui({ game: gameFrom([3]), thinking: true, pending: true }))} />);
    expect(html.includes("El bot está pensando")).toBe(true);
    expect(count(html, 'aria-disabled="false"')).toBe(0);
  });

  it("al terminar muestra el resultado y la opción de jugar otra vez", () => {
    const game = gameFrom([0, 1, 0, 1, 0, 1, 0], { status: "won", winner: 1, nextPlayer: null, winningCells: [[0, 0], [1, 0], [2, 0], [3, 0]], legalMoves: [] });
    const html = renderToStaticMarkup(<App game={api(ui({ game }))} />);
    expect(html.includes("¡Ganaste!")).toBe(true);
    expect(html.includes("Jugar otra vez")).toBe(true);
  });
});

describe("cambiar quién abre", () => {
  /** API falsa que registra las llamadas; `newGame("bot")` deja el tablero como lo dejaría el bot al abrir. */
  const fake = (state: ReturnType<typeof ui>) => {
    const calls = { opener: [] as Role[], newGame: [] as Array<Role | undefined> };
    const api = {
      state,
      setOpener: (o: Role) => void calls.opener.push(o),
      newGame: async (o?: Role) => {
        calls.newGame.push(o);
        if (o === "bot") api.state = ui({ opener: "bot", humanPlayer: 2, game: gameFrom([3]) });
      },
    };
    return { api, calls };
  };

  it("con el tablero vacío, elegir «El bot» empieza la partida y el bot pone la primera ficha", () => {
    const { api, calls } = fake(ui({ game: gameFrom([]) }));
    changeOpener(api, "bot");
    expect(calls.opener).toEqual(["bot"]);
    expect(calls.newGame).toEqual(["bot"]);
    const html = renderToStaticMarkup(<App game={{ ...api, play: async () => {}, undo: async () => {}, retry: async () => {}, setDifficulty: noop }} />);
    expect(html.includes("Bot, columna 4")).toBe(true);
    expect(html.includes("Tu turno")).toBe(true);
  });

  it("con jugadas en curso, elegir «El bot» no reinicia la partida y avisa que aplica en la siguiente", () => {
    const state = ui({ game: gameFrom([3, 4]) });
    const { api, calls } = fake(state);
    changeOpener(api, "bot");
    expect(calls.opener).toEqual(["bot"]);
    expect(calls.newGame).toEqual([]);
    const html = renderToStaticMarkup(<App game={{ ...api, state: { ...state, opener: "bot" }, play: async () => {}, undo: async () => {}, retry: async () => {}, setDifficulty: noop }} />);
    expect(html.includes("Se aplica al empezar una nueva partida.")).toBe(true);
    // Las dos jugadas siguen en el historial: la partida no se reinició.
    expect(html.includes("Tú, columna 4") && html.includes("Bot, columna 5")).toBe(true);
  });

  it("con la partida terminada solo guarda la preferencia", () => {
    const game = gameFrom([0, 1, 0, 1, 0, 1, 0], { status: "won", winner: 1, nextPlayer: null, legalMoves: [] });
    const { api, calls } = fake(ui({ game }));
    changeOpener(api, "bot");
    expect(calls.newGame).toEqual([]);
  });

  it("mientras hay una petición pendiente no reinicia, aunque el tablero esté vacío", () => {
    const { api, calls } = fake(ui({ opener: "bot", humanPlayer: 2, game: gameFrom([]), pending: true, thinking: true }));
    changeOpener(api, "human");
    expect(calls.newGame).toEqual([]);
  });
});
