import { describe, expect, it } from "vitest";
import {
  canDrop,
  describeStats,
  difficultyParams,
  history,
  initialState,
  isBotTurn,
  isHumanTurn,
  lastMoveCell,
  reducer,
  roleOf,
  statusMessage,
  undoMoves,
} from "../src/game/reducer";
import { gameFrom, ui } from "./fixtures";

describe("reducer", () => {
  it("start: si abre el bot, la persona es el jugador 2", () => {
    const s = reducer(initialState, { type: "start", opener: "bot" });
    expect(s.humanPlayer).toBe(2);
    expect(s.opener).toBe("bot");
    expect(s.game).toBeNull();
  });

  it("request bloquea el tablero y borra errores y avisos", () => {
    const s = reducer(ui({ error: { message: "x", retry: "new" }, notice: "y" }), { type: "request", thinking: true });
    expect(s.pending).toBe(true);
    expect(s.thinking).toBe(true);
    expect(s.error).toBeNull();
    expect(s.notice).toBeNull();
  });

  it("botMoved guarda el estado y las estadísticas y desbloquea", () => {
    const stats = { depth: 9, nodes: 100, ms: 300, score: 5, reason: "search" as const };
    const s = reducer(ui({ pending: true, thinking: true }), { type: "botMoved", game: gameFrom([3, 4]), stats });
    expect(s.pending).toBe(false);
    expect(s.thinking).toBe(false);
    expect(s.lastStats).toEqual(stats);
  });

  it("failed guarda qué reintentar", () => {
    const s = reducer(ui({ pending: true }), { type: "failed", message: "Sin conexión", retry: "play", column: 2 });
    expect(s.error).toEqual({ message: "Sin conexión", retry: "play", column: 2 });
    expect(s.pending).toBe(false);
  });

  it("configure cambia quién abre y la dificultad sin tocar la partida", () => {
    const game = gameFrom([3]);
    const s = reducer(ui({ game }), { type: "configure", opener: "bot", difficulty: "facil" });
    expect(s.opener).toBe("bot");
    expect(s.difficulty).toBe("facil");
    expect(s.game).toBe(game);
  });

  it("notice muestra un aviso sin error", () => {
    const s = reducer(ui({ pending: true }), { type: "notice", message: "La columna 0 está llena." });
    expect(s.notice).toBe("La columna 0 está llena.");
    expect(s.error).toBeNull();
  });
});

describe("turnos y columnas", () => {
  it("le toca a la persona cuando nextPlayer es su número", () => {
    expect(isHumanTurn(ui({ game: gameFrom([]) }))).toBe(true);
    expect(isBotTurn(ui({ game: gameFrom([3]) }))).toBe(true);
    expect(isHumanTurn(ui({ game: gameFrom([3]), humanPlayer: 2 }))).toBe(true);
  });

  it("canDrop: solo columnas legales, en su turno y sin peticiones en curso", () => {
    const game = gameFrom([], { legalMoves: [0, 5] });
    expect(canDrop(ui({ game }), 5)).toBe(true);
    expect(canDrop(ui({ game }), 3)).toBe(false);
    expect(canDrop(ui({ game, pending: true }), 5)).toBe(false);
    expect(canDrop(ui({ game, error: { message: "x", retry: "new" } }), 5)).toBe(false);
    expect(canDrop(ui({ game: gameFrom([3]) }), 0)).toBe(false); // turno del bot
    expect(canDrop(ui(), 0)).toBe(false); // sin partida
  });

  it("roleOf asigna el color por rol, no por quién abrió", () => {
    expect(roleOf(1, 1)).toBe("human");
    expect(roleOf(1, 2)).toBe("bot");
  });
});

describe("statusMessage", () => {
  it.each([
    ["sin partida", ui(), "idle", "Elige quién abre"],
    ["tu turno", ui({ game: gameFrom([]) }), "turn", "Elige una columna"],
    ["bot pensando", ui({ game: gameFrom([3]), thinking: true }), "thinking", "pensando"],
    ["ganaste", ui({ game: gameFrom([], { status: "won", winner: 1 }) }), "won", "Ganaste"],
    ["ganó el bot", ui({ game: gameFrom([], { status: "won", winner: 2 }) }), "lost", "Ganó el bot"],
    ["empate", ui({ game: gameFrom([], { status: "draw" }) }), "draw", "Empate"],
    ["error", ui({ error: { message: "No hay conexión con el bot.", retry: "new" } }), "error", "No hay conexión"],
  ] as Array<[string, ReturnType<typeof ui>, string, string]>)("%s", (_name, state, tone, text) => {
    const m = statusMessage(state);
    expect(m.tone).toBe(tone);
    expect(m.text.includes(text)).toBe(true);
  });
});

describe("lastMoveCell", () => {
  it("encuentra la casilla de la última ficha", () => {
    expect(lastMoveCell(gameFrom([3, 3, 5]))).toEqual([0, 5]);
    expect(lastMoveCell(gameFrom([3, 3]))).toEqual([1, 3]);
    expect(lastMoveCell(gameFrom([]))).toBeNull();
    expect(lastMoveCell(null)).toBeNull();
  });
});

describe("undoMoves", () => {
  it("abre la persona: quita su jugada y la respuesta del bot", () => {
    expect(undoMoves(gameFrom([3, 4, 2, 5]), 1)).toEqual([3, 4]);
    expect(undoMoves(gameFrom([3, 4]), 1)).toEqual([]);
  });

  it("si la persona acaba de ganar, quita solo su jugada", () => {
    expect(undoMoves(gameFrom([0, 1, 0, 1, 0, 1, 0]), 1)).toEqual([0, 1, 0, 1, 0, 1]);
  });

  it("abre el bot: nunca quita la primera jugada del bot", () => {
    expect(undoMoves(gameFrom([3, 4, 2]), 2)).toEqual([3]);
    expect(undoMoves(gameFrom([3]), 2)).toBeNull();
  });

  it("sin jugadas de la persona no hay nada que deshacer", () => {
    expect(undoMoves(gameFrom([]), 1)).toBeNull();
    expect(undoMoves(null, 1)).toBeNull();
  });
});

describe("history", () => {
  it("numera las columnas de 1 a 8 y dice quién jugó", () => {
    expect(history(gameFrom([0, 7]), 1)).toEqual([
      { turn: 1, role: "human", column: 1 },
      { turn: 2, role: "bot", column: 8 },
    ]);
    expect(history(gameFrom([0]), 2)[0]?.role).toBe("bot");
    expect(history(null, 1)).toEqual([]);
  });
});

describe("describeStats", () => {
  it("explica la búsqueda en palabras", () => {
    expect(describeStats({ depth: 13, nodes: 1_400_000, ms: 947, score: 20, reason: "search" })).toBe(
      "El bot miró 13 jugadas adelante: 1.4 millones de posiciones en 0.9 s.",
    );
    expect(describeStats({ depth: 6, nodes: 759, ms: 3, score: 0, reason: "search" })?.includes("en un instante")).toBe(true);
  });

  it.each([
    ["win-now", "podía ganar"],
    ["block", "bloqueó"],
    ["only-move", "única columna"],
    ["fallback", "segura"],
  ] as Array<[string, string]>)("razón %s", (reason, text) => {
    const s = describeStats({ depth: 0, nodes: 0, ms: 0, score: 0, reason: reason as "search" });
    expect(s?.includes(text)).toBe(true);
  });

  it("sin estadísticas no dice nada", () => {
    expect(describeStats(null)).toBeNull();
  });
});

describe("difficultyParams", () => {
  it("fácil limita la profundidad; difícil solo el tiempo", () => {
    expect(difficultyParams("facil")).toEqual({ budgetMs: 300, maxDepth: 2 });
    expect(difficultyParams("dificil")).toEqual({ budgetMs: 1500 });
  });
});
