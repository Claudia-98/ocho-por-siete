import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AuthError, ArbiterClient, type FetchLike } from "../../src/arbiter/client.js";
import { ProtocolError, parseNextResponse } from "../../src/arbiter/types.js";
import { createBoard } from "../../src/rules/index.js";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** fetch falso: responde lo que se le programe y guarda cada llamada. */
function fakeFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const next = responses.shift();
    if (!next) throw new Error("fakeFetch: no hay más respuestas programadas");
    return new Response(next.body === undefined ? "" : JSON.stringify(next.body), { status: next.status });
  };
  return { fetch, calls };
}

const openapi = JSON.parse(readFileSync(new URL("../../../docs/arbitro-openapi.json", import.meta.url), "utf8"));
const exampleTurn = openapi.paths["/api/next"].get.responses["200"].content["application/json"].examples.turn.value;

describe("parseNextResponse", () => {
  it("interpreta el ejemplo de turno del OpenAPI oficial", () => {
    const turn = parseNextResponse(exampleTurn);
    expect(turn.status).toBe("turn");
    if (turn.status !== "turn") return;
    expect(turn.game_id).toBe("g_7f3a");
    expect(turn.you).toBe(2);
    expect(turn.legal_moves).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(turn.board[0]).toEqual([0, 0, 1, 2, 1, 0, 0, 0]); // se usa tal cual, sin reconstruir desde moves
    expect(turn.last_move).toEqual({ by: 1, column: 3 });
    expect(turn.deadline_ms).toBe(3000);
  });

  it("interpreta idle", () => {
    expect(parseNextResponse({ status: "idle" })).toEqual({ status: "idle" });
  });

  it("tolera campos informativos ausentes o raros", () => {
    const turn = parseNextResponse({ status: "turn", game_id: "g1", you: 1, board: createBoard(), legal_moves: [3], last_move: "?" });
    expect(turn.status === "turn" && turn.last_move === null && turn.deadline_ms === 3000 && turn.moves.length === 0).toBe(true);
  });

  it.each([
    ["no es objeto", "hola"],
    ["status desconocido", { status: "otro" }],
    ["sin game_id", { ...exampleTurn, game_id: undefined }],
    ["you inválido", { ...exampleTurn, you: 3 }],
    ["tablero 7×6", { ...exampleTurn, board: Array(6).fill(Array(7).fill(0)) }],
    ["legal_moves fuera de rango", { ...exampleTurn, legal_moves: [8] }],
  ])("rechaza respuestas mal formadas: %s", (_name, body) => {
    expect(() => parseNextResponse(body)).toThrow(ProtocolError);
  });
});

describe("ArbiterClient", () => {
  const make = (responses: Array<{ status: number; body: unknown }>) => {
    const fake = fakeFetch(responses);
    return { client: new ArbiterClient({ baseUrl: "https://arbitro.test/", token: "secreto", fetch: fake.fetch }), calls: fake.calls };
  };

  it("next: llama a /api/next?wait=N con el token Bearer y devuelve el turno", async () => {
    const { client, calls } = make([{ status: 200, body: exampleTurn }]);
    const res = await client.next(20);
    expect(res.status).toBe("turn");
    expect(calls[0]!.url).toBe("https://arbitro.test/api/next?wait=20");
    expect(calls[0]!.headers.Authorization).toBe("Bearer secreto");
  });

  it("next: 401 lanza AuthError", async () => {
    const { client } = make([{ status: 401, body: { ok: false, error: "unauthorized", message: "Token inválido." } }]);
    let err: unknown;
    try {
      await client.next(20);
    } catch (e) {
      err = e;
    }
    expect(err instanceof AuthError).toBe(true);
  });

  it("next: un 500 lanza ProtocolError (el ciclo reintenta)", async () => {
    const { client } = make([{ status: 500, body: { ok: false, error: "internal" } }]);
    let err: unknown;
    try {
      await client.next(20);
    } catch (e) {
      err = e;
    }
    expect(err instanceof ProtocolError).toBe(true);
  });

  it("move: envía { game_id, column } por POST y devuelve la jugada aceptada", async () => {
    const { client, calls } = make([{ status: 200, body: { ok: true, state: "won", turn: 10, winning_cells: [[0, 2], [1, 3], [2, 4], [3, 5]] } }]);
    const res = await client.move("g_7f3a", 4);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe("https://arbitro.test/api/move");
    expect(calls[0]!.body).toEqual({ game_id: "g_7f3a", column: 4 });
    expect(res).toEqual({ kind: "accepted", response: { ok: true, state: "won", turn: 10, winning_cells: [[0, 2], [1, 3], [2, 4], [3, 5]] } });
  });

  it.each([
    [400, "illegal_move", true],
    [400, "timeout", true],
    [400, "validation", false],
    [409, "not_your_turn", false],
    [409, "unknown_game", false],
  ] as Array<[number, string, boolean]>)("move: %s %s → rechazada, penalizada = %s", async (status, error, penalized) => {
    const { client } = make([{ status, body: { ok: false, error, message: "x" } }]);
    const res = await client.move("g1", 3);
    expect(res.kind).toBe("rejected");
    expect(res.kind === "rejected" && res.penalized).toBe(penalized);
    expect(res.kind === "rejected" && res.error.error).toBe(error);
  });

  it("move: un error sin el formato del árbitro igual se reporta", async () => {
    const { client } = make([{ status: 502, body: "Bad Gateway" }]);
    const res = await client.move("g1", 3);
    expect(res.kind === "rejected" && res.error.error).toBe("http_502");
  });

  it("move: 401 lanza AuthError", async () => {
    const { client } = make([{ status: 401, body: { ok: false, error: "unauthorized" } }]);
    let err: unknown;
    try {
      await client.move("g1", 3);
    } catch (e) {
      err = e;
    }
    expect(err instanceof AuthError).toBe(true);
  });

  it("practice y me: llaman a sus rutas con el token", async () => {
    const { client, calls } = make([
      { status: 201, body: { game_id: "g_p_01", you: 1 } },
      { status: 200, body: { team: { id: "eq4", name: "Ocho por Siete" } } },
    ]);
    expect(await client.practice("casa-basico", 1)).toEqual({ game_id: "g_p_01", you: 1 });
    expect(calls[0]!.body).toEqual({ opponent: "casa-basico", first: 1 });
    expect(((await client.me()) as { team: { id: string } }).team.id).toBe("eq4");
    expect(calls[1]!.url).toBe("https://arbitro.test/api/me");
  });

  it("practice: 423 (prácticas cerradas) lanza ProtocolError", async () => {
    const { client } = make([{ status: 423, body: { ok: false, error: "practice_closed" } }]);
    let err: unknown;
    try {
      await client.practice("casa-basico", 1);
    } catch (e) {
      err = e;
    }
    expect(err instanceof ProtocolError).toBe(true);
  });
});
