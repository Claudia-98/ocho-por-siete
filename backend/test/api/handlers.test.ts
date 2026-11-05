import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import { handleApi, INVALID_JSON, replayMoves, type ApiDeps, type ApiResponse } from "../../src/api/handlers.js";

const deps: ApiDeps = { now: () => performance.now(), defaultBudgetMs: 100 };

function call(method: string, path: string, body?: unknown, extra: Partial<ApiDeps> = {}, query = ""): Promise<ApiResponse> {
  return handleApi({ method, path, query: new URLSearchParams(query), body }, { ...deps, ...extra });
}

type Body = Record<string, unknown>;
const bodyOf = (r: ApiResponse) => r.body as Body;

describe("GET /api/v1/health", () => {
  it("responde ok", async () => {
    expect(await call("GET", "/api/v1/health")).toEqual({ status: 200, body: { ok: true } });
  });
});

describe("POST /api/v1/state", () => {
  it("partida nueva: tablero vacío, le toca al 1, 8 columnas legales", async () => {
    const r = await call("POST", "/api/v1/state", { moves: [] });
    expect(r.status).toBe(200);
    const b = bodyOf(r);
    expect(b.status).toBe("playing");
    expect(b.nextPlayer).toBe(1);
    expect(b.legalMoves).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(b.moves).toEqual([]);
    expect((b.board as number[][])[0]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("partida ganada: status won, ganador y casillas para resaltar", async () => {
    const b = bodyOf(await call("POST", "/api/v1/state", { moves: [0, 1, 0, 1, 0, 1, 0] }));
    expect(b.status).toBe("won");
    expect(b.winner).toBe(1);
    expect(b.winningCells).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(b.legalMoves).toEqual([]);
  });

  it.each([
    ["sin moves", {}],
    ["moves no es lista", { moves: "3,4" }],
    ["columna fuera de rango", { moves: [3, 8] }],
    ["columna llena", { moves: [0, 0, 0, 0, 0, 0, 0, 0] }],
    ["jugadas después de ganar", { moves: [0, 1, 0, 1, 0, 1, 0, 1] }],
  ])("rechaza moves inválidos con 400 validation: %s", async (_name, body) => {
    const r = await call("POST", "/api/v1/state", body);
    expect(r.status).toBe(400);
    expect(bodyOf(r).error).toBe("validation");
    expect(bodyOf(r).ok).toBe(false);
  });
});

describe("POST /api/v1/play (jugada humana)", () => {
  it("aplica la jugada y devuelve el nuevo estado", async () => {
    const b = bodyOf(await call("POST", "/api/v1/play", { moves: [3], column: 4 }));
    expect(b.moves).toEqual([3, 4]);
    expect((b.board as number[][])[0]).toEqual([0, 0, 0, 1, 2, 0, 0, 0]);
    expect(b.nextPlayer).toBe(1);
  });

  it("columna llena: 400 illegal_move con un mensaje para mostrar", async () => {
    const r = await call("POST", "/api/v1/play", { moves: [0, 0, 0, 0, 0, 0, 0], column: 0 });
    expect(r.status).toBe(400);
    expect(bodyOf(r)).toEqual({ ok: false, error: "illegal_move", message: "La columna 0 está llena." });
  });

  it("columna inexistente: 400 illegal_move", async () => {
    const r = await call("POST", "/api/v1/play", { moves: [], column: 9 });
    expect(bodyOf(r).error).toBe("illegal_move");
  });

  it("si la partida ya terminó: 400 game_over", async () => {
    const r = await call("POST", "/api/v1/play", { moves: [0, 1, 0, 1, 0, 1, 0], column: 5 });
    expect(r.status).toBe(400);
    expect(bodyOf(r).error).toBe("game_over");
  });

  it("la jugada ganadora del humano devuelve won", async () => {
    const b = bodyOf(await call("POST", "/api/v1/play", { moves: [0, 1, 0, 1, 0, 1], column: 0 }));
    expect(b.status).toBe("won");
    expect(b.winner).toBe(1);
  });

  it("cuerpo que no es objeto: 400 validation", async () => {
    expect(bodyOf(await call("POST", "/api/v1/play", "hola")).error).toBe("validation");
  });
});

describe("POST /api/v1/bot-move", () => {
  it("el bot abre la partida: devuelve columna legal, estado nuevo y estadísticas", async () => {
    const b = bodyOf(await call("POST", "/api/v1/bot-move", { moves: [] }));
    const column = b.column as number;
    expect(column >= 0 && column <= 7).toBe(true);
    const state = b.state as Body;
    expect(state.moves).toEqual([column]);
    expect(state.nextPlayer).toBe(2);
    const stats = b.stats as Body;
    expect(typeof stats.depth).toBe("number");
    expect((stats.ms as number) <= 200).toBe(true); // defaultBudgetMs = 100
  });

  it("es el mismo algoritmo del torneo: gana si puede", async () => {
    // Jugador 2 (bot) tiene tres en la columna 1; le toca a 2 después de que el 1 jugó.
    const b = bodyOf(await call("POST", "/api/v1/bot-move", { moves: [0, 1, 0, 1, 2, 1, 7] }));
    expect(b.column).toBe(1);
    expect((b.state as Body).status).toBe("won");
    expect((b.state as Body).winner).toBe(2);
  });

  it("bloquea el cuatro inmediato del humano", async () => {
    const b = bodyOf(await call("POST", "/api/v1/bot-move", { moves: [0, 7, 0, 7, 0] }));
    expect(b.column).toBe(0);
  });

  it("maxDepth limita la profundidad (para niveles de dificultad)", async () => {
    const b = bodyOf(await call("POST", "/api/v1/bot-move", { moves: [3, 4], maxDepth: 2, budgetMs: 2000 }));
    expect((b.stats as Body).depth).toBe(2);
  });

  it("budgetMs se limita a un rango seguro", async () => {
    const t0 = performance.now();
    await call("POST", "/api/v1/bot-move", { moves: [], budgetMs: 1 });
    expect(performance.now() - t0 < 500).toBe(true);
  });

  it("budgetMs que no es número: 400 validation", async () => {
    expect(bodyOf(await call("POST", "/api/v1/bot-move", { moves: [], budgetMs: "rápido" })).error).toBe("validation");
  });

  it("si la partida ya terminó: 400 game_over", async () => {
    expect(bodyOf(await call("POST", "/api/v1/bot-move", { moves: [0, 1, 0, 1, 0, 1, 0] })).error).toBe("game_over");
  });
});

describe("replay de partidas del torneo (proxy al árbitro)", () => {
  const fakeFetch = (status: number, text: string) => {
    const urls: string[] = [];
    return {
      urls,
      fetch: async (url: string) => {
        urls.push(url);
        return new Response(text, { status });
      },
    };
  };

  it("GET /api/v1/replay/:id consulta /api/games/{id} del árbitro", async () => {
    const f = fakeFetch(200, JSON.stringify({ game_id: "g_7f3a", moves: [] }));
    const r = await call("GET", "/api/v1/replay/g_7f3a", undefined, { arbiterUrl: "https://arbitro.test/", fetch: f.fetch });
    expect(r).toEqual({ status: 200, body: { game_id: "g_7f3a", moves: [] } });
    expect(f.urls).toEqual(["https://arbitro.test/api/games/g_7f3a"]);
  });

  it("GET /api/v1/games pasa kind y limit al árbitro", async () => {
    const f = fakeFetch(200, "[]");
    await call("GET", "/api/v1/games", undefined, { arbiterUrl: "https://arbitro.test", fetch: f.fetch }, "kind=league&limit=5&otro=x");
    expect(f.urls).toEqual(["https://arbitro.test/api/games?kind=league&limit=5"]);
  });

  it("respeta el 404 del árbitro", async () => {
    const f = fakeFetch(404, JSON.stringify({ ok: false, error: "unknown_game", message: "No existe." }));
    const r = await call("GET", "/api/v1/replay/g_x", undefined, { arbiterUrl: "https://a.test", fetch: f.fetch });
    expect(r.status).toBe(404);
  });

  it("sin ARBITRO_URL responde 503", async () => {
    expect((await call("GET", "/api/v1/replay/g_1")).status).toBe(503);
  });

  it("árbitro caído o respuesta rara: 502", async () => {
    const down = { arbiterUrl: "https://a.test", fetch: async () => Promise.reject(new TypeError("fetch failed")) };
    expect((await call("GET", "/api/v1/replay/g_1", undefined, down)).status).toBe(502);
    const html = fakeFetch(200, "<html>");
    expect((await call("GET", "/api/v1/replay/g_1", undefined, { arbiterUrl: "https://a.test", fetch: html.fetch })).status).toBe(502);
  });
});

describe("errores generales", () => {
  it("JSON inválido: 400 validation", async () => {
    expect(bodyOf(await call("POST", "/api/v1/state", INVALID_JSON)).error).toBe("validation");
  });

  it("ruta inexistente: 404 not_found", async () => {
    const r = await call("GET", "/api/v1/nada");
    expect(r.status).toBe(404);
    expect(bodyOf(r).error).toBe("not_found");
  });
});

describe("replayMoves", () => {
  it("reconstruye el tablero alternando jugadores", () => {
    expect(replayMoves([3, 3]).board.map((row) => row[3])).toEqual([1, 2, 0, 0, 0, 0, 0]);
  });
});
