import { describe, expect, it } from "vitest";
import { AuthError, type MoveResult } from "../../src/arbiter/client.js";
import { BACKOFF_MS, playTurn, runLoop, safeColumn, type LoopDeps } from "../../src/arbiter/loop.js";
import type { NextResponse, Turn } from "../../src/arbiter/types.js";
import type { MoveDecision } from "../../src/engine/index.js";
import { createBoard } from "../../src/rules/index.js";

const turn = (over: Partial<Turn> = {}): Turn => ({
  status: "turn",
  game_id: "g1",
  match_id: null,
  kind: "practice",
  you: 1,
  opponent: "casa-basico",
  turn: 1,
  board: createBoard(),
  moves: [],
  last_move: null,
  legal_moves: [0, 1, 2, 3, 4, 5, 6, 7],
  deadline_ms: 3000,
  served_at: "2026-11-05T14:00:00.000Z",
  ...over,
});

const decision = (column: number): MoveDecision => ({ column, stats: { depth: 5, nodes: 100, ms: 10, score: 0, reason: "search" } });
const accepted: MoveResult = { kind: "accepted", response: { ok: true, state: "playing", turn: 2 } };

/** Árbitro simulado: una lista de cosas que devuelve `next` (o lanza) y registro de jugadas enviadas. */
function harness(script: Array<NextResponse | Error>, options: { moveResults?: Array<MoveResult | Error>; decide?: (t: Turn) => MoveDecision } = {}) {
  const sent: Array<{ gameId: string; column: number }> = [];
  const sleeps: number[] = [];
  const logs: string[] = [];
  const decided: Turn[] = [];
  let clock = 0;
  const deps: LoopDeps = {
    client: {
      next: async () => {
        const item = script.shift();
        if (item instanceof Error) throw item;
        return item ?? { status: "idle" };
      },
      move: async (gameId, column) => {
        sent.push({ gameId, column });
        const r = options.moveResults?.shift() ?? accepted;
        if (r instanceof Error) throw r;
        return r;
      },
    },
    decide: (t) => {
      decided.push(t);
      return options.decide ? options.decide(t) : decision(3);
    },
    log: (l) => logs.push(l),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    now: () => (clock += 10),
    shouldStop: () => script.length === 0,
  };
  return { deps, sent, sleeps, logs, decided };
}

describe("safeColumn", () => {
  it("deja pasar una columna legal", () => expect(safeColumn(5, [1, 5])).toBe(5));
  it("cambia una ilegal por la legal más central", () => expect(safeColumn(9, [0, 4, 7])).toBe(4));
  it("sin jugadas legales devuelve la original", () => expect(safeColumn(2, [])).toBe(2));
});

describe("runLoop", () => {
  it("con un turno: le pasa al algoritmo board, you y legal_moves, y envía la columna", async () => {
    const t = turn({ you: 2, legal_moves: [1, 3, 6] });
    const h = harness([t, { status: "idle" }]);
    await runLoop(h.deps);
    expect(h.decided).toEqual([t]);
    expect(h.sent).toEqual([{ gameId: "g1", column: 3 }]);
    expect(h.logs.some((l) => l.includes("turno 1") && l.includes("columna 3") && l.includes("sigue"))).toBe(true);
  });

  it("idle: vuelve a preguntar sin dormir", async () => {
    const h = harness([{ status: "idle" }, { status: "idle" }]);
    await runLoop(h.deps);
    expect(h.sleeps).toEqual([]);
    expect(h.sent).toEqual([]);
  });

  it("si el algoritmo devuelve una columna ilegal, se corrige antes de enviar", async () => {
    const h = harness([turn({ legal_moves: [0, 7] }), { status: "idle" }], { decide: () => decision(3) });
    await runLoop(h.deps);
    expect(h.sent).toEqual([{ gameId: "g1", column: 0 }]);
    expect(h.logs.some((l) => l.includes("no está en legal_moves"))).toBe(true);
  });

  it("si el algoritmo lanza un error, igual juega la columna legal más central", async () => {
    const h = harness([turn({ legal_moves: [2, 5] }), { status: "idle" }], {
      decide: () => {
        throw new Error("bug");
      },
    });
    await runLoop(h.deps);
    // Orden del centro hacia afuera: 3, 4, 2, 5… → entre 2 y 5 va primero la 2.
    expect(h.sent).toEqual([{ gameId: "g1", column: 2 }]);
  });

  it("errores de red: reintenta con espera creciente y la reinicia tras un éxito", async () => {
    const net = () => new TypeError("fetch failed");
    const h = harness([net(), net(), net(), net(), net(), { status: "idle" }, net()]);
    await runLoop(h.deps);
    expect(h.sleeps).toEqual([BACKOFF_MS[0], BACKOFF_MS[1], BACKOFF_MS[2], BACKOFF_MS[3], BACKOFF_MS[3], BACKOFF_MS[0]]);
  });

  it("401: se detiene con AuthError (reintentar no sirve)", async () => {
    const h = harness([new AuthError(), { status: "idle" }]);
    let err: unknown;
    try {
      await runLoop(h.deps);
    } catch (e) {
      err = e;
    }
    expect(err instanceof AuthError).toBe(true);
    expect(h.logs.some((l) => l.includes("TEAM_TOKEN"))).toBe(true);
  });

  it("409 not_your_turn: lo registra y sigue jugando", async () => {
    const rejected: MoveResult = { kind: "rejected", status: 409, error: { ok: false, error: "not_your_turn", message: "x" }, penalized: false };
    const h = harness([turn(), turn({ game_id: "g2" }), { status: "idle" }], { moveResults: [rejected, accepted] });
    await runLoop(h.deps);
    expect(h.sent.map((s) => s.gameId)).toEqual(["g1", "g2"]);
    expect(h.logs.some((l) => l.includes("not_your_turn") && l.includes("sin penalización"))).toBe(true);
  });

  it("registra las derrotas por jugada ilegal o tiempo", async () => {
    const lost: MoveResult = { kind: "rejected", status: 400, error: { ok: false, error: "timeout", message: "tarde" }, penalized: true };
    const h = harness([turn(), { status: "idle" }], { moveResults: [lost] });
    await runLoop(h.deps);
    expect(h.logs.some((l) => l.includes("PERDIMOS LA PARTIDA"))).toBe(true);
  });

  it("registra la victoria con las casillas ganadoras", async () => {
    const won: MoveResult = { kind: "accepted", response: { ok: true, state: "won", turn: 7, winning_cells: [[0, 0], [1, 0], [2, 0], [3, 0]] } };
    const h = harness([turn(), { status: "idle" }], { moveResults: [won] });
    await runLoop(h.deps);
    expect(h.logs.some((l) => l.includes("¡GANAMOS!"))).toBe(true);
  });
});

describe("playTurn: red caída al enviar la jugada", () => {
  it("reintenta el POST una vez si hay tiempo", async () => {
    const h = harness([], { moveResults: [new TypeError("socket hang up"), accepted] });
    const res = await playTurn(turn(), h.deps, 0);
    expect(res).toEqual(accepted);
    expect(h.sent).toHaveLength(2);
  });

  it("no reintenta si ya pasó demasiado tiempo desde que llegó el turno", async () => {
    const h = harness([], { moveResults: [new TypeError("socket hang up"), accepted] });
    h.deps.now = () => 5000;
    let err: unknown;
    try {
      await playTurn(turn(), h.deps, 0);
    } catch (e) {
      err = e;
    }
    expect(err instanceof TypeError).toBe(true);
    expect(h.sent).toHaveLength(1);
  });

  it("un 401 al enviar no se reintenta", async () => {
    const h = harness([], { moveResults: [new AuthError()] });
    let err: unknown;
    try {
      await playTurn(turn(), h.deps, 0);
    } catch (e) {
      err = e;
    }
    expect(err instanceof AuthError).toBe(true);
    expect(h.sent).toHaveLength(1);
  });
});
