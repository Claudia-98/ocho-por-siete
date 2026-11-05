import { describe, expect, it } from "vitest";
import { ApiError, NETWORK_MESSAGE, createClient, type FetchLike } from "../src/api/client";
import { gameFrom } from "./fixtures";

function fake(status: number, body: string) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) });
    return new Response(body, { status });
  };
  return { fetchFn, calls };
}

async function failure(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error("se esperaba un error");
}

describe("cliente de la API", () => {
  it("play: envía moves y column a /play y devuelve el estado", async () => {
    const game = gameFrom([3, 4]);
    const f = fake(200, JSON.stringify(game));
    const res = await createClient("/api/v1", f.fetchFn).play([3], 4);
    expect(res).toEqual(game);
    expect(f.calls).toEqual([{ url: "/api/v1/play", body: { moves: [3], column: 4 } }]);
  });

  it("botMove: manda budgetMs y maxDepth", async () => {
    const f = fake(200, JSON.stringify({ column: 3, state: gameFrom([3]), stats: {} }));
    await createClient("/api/v1", f.fetchFn).botMove([], { budgetMs: 300, maxDepth: 2 });
    expect(f.calls[0]).toEqual({ url: "/api/v1/bot-move", body: { moves: [], budgetMs: 300, maxDepth: 2 } });
  });

  it("state: llama a /state", async () => {
    const f = fake(200, JSON.stringify(gameFrom([])));
    await createClient("/x", f.fetchFn).state([]);
    expect(f.calls[0]?.url).toBe("/x/state");
  });

  it("un error de la API conserva el código y el mensaje para mostrar", async () => {
    const f = fake(400, JSON.stringify({ ok: false, error: "illegal_move", message: "La columna 0 está llena." }));
    const err = await failure(createClient("/api/v1", f.fetchFn).play([], 0));
    expect(err instanceof ApiError).toBe(true);
    expect(err.code).toBe("illegal_move");
    expect(err.message).toBe("La columna 0 está llena.");
    expect(err.status).toBe(400);
  });

  it("sin conexión: mensaje claro de qué revisar", async () => {
    const down: FetchLike = async () => Promise.reject(new TypeError("Failed to fetch"));
    const err = await failure(createClient("/api/v1", down).state([]));
    expect(err.code).toBe("network");
    expect(err.message).toBe(NETWORK_MESSAGE);
  });

  it("5xx sin JSON (proxy de Vite con la API apagada) también es falta de conexión", async () => {
    const err = await failure(createClient("/api/v1", fake(502, "Bad Gateway").fetchFn).state([]));
    expect(err.code).toBe("network");
  });

  it("respuesta que no es JSON con 200: bad_response", async () => {
    const err = await failure(createClient("/api/v1", fake(200, "<html>").fetchFn).state([]));
    expect(err.code).toBe("bad_response");
  });

  it("error sin formato del backend: usa el código HTTP", async () => {
    const err = await failure(createClient("/api/v1", fake(404, "{}").fetchFn).state([]));
    expect(err.code).toBe("http_404");
  });
});
