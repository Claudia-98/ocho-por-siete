import { describe, expect, it } from "vitest";
import { Arbiter, ArbiterError } from "../src/arbiter.js";
import { houseMove, immediateWin } from "../src/house.js";
import type { Team, Turn } from "../src/types.js";
import { FakeScheduler } from "./fake-scheduler.js";
import { picture } from "../../backend/test/helpers.js";

const EQ4: Team = { id: "eq4", name: "Ocho por Siete", token: "t-eq4", members: [] };
const PRUEBA: Team = { id: "prueba", name: "Prueba", token: "t-prueba", members: [], test: true };

function setup(options: { random?: () => number } = {}) {
  const clock = new FakeScheduler();
  const arbiter = new Arbiter({ teams: [EQ4, PRUEBA], scheduler: clock, random: options.random ?? (() => 0) });
  return { clock, arbiter };
}

async function nextTurn(arbiter: Arbiter, team: Team): Promise<Turn> {
  const res = await arbiter.next(team, 0).promise;
  if (res.status !== "turn") throw new Error("Se esperaba un turno y llegó idle");
  return res;
}

function expectError(fn: () => unknown, status: number, error: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught instanceof ArbiterError).toBe(true);
  expect((caught as ArbiterError).status).toBe(status);
  expect((caught as ArbiterError).body.error).toBe(error);
}

describe("autenticación", () => {
  it("acepta el token del equipo con Bearer", () => {
    const { arbiter } = setup();
    expect(arbiter.authenticate("Bearer t-eq4").id).toBe("eq4");
  });

  it("rechaza token ausente o inválido con 401 unauthorized", () => {
    const { arbiter } = setup();
    expectError(() => arbiter.authenticate(undefined), 401, "unauthorized");
    expectError(() => arbiter.authenticate("Bearer otro"), 401, "unauthorized");
  });
});

describe("práctica contra la casa", () => {
  it("si abre el equipo, el primer turno llega de inmediato con el formato del OpenAPI", async () => {
    const { arbiter, clock } = setup();
    const { game_id, you } = arbiter.createPractice(EQ4, { opponent: "casa-basico", first: 1 });
    expect(you).toBe(1);
    const turn = await nextTurn(arbiter, EQ4);
    expect(turn.game_id).toBe(game_id);
    expect(turn.you).toBe(1);
    expect(turn.turn).toBe(1);
    expect(turn.kind).toBe("practice");
    expect(turn.match_id).toBeNull();
    expect(turn.opponent).toBe("casa-basico");
    expect(turn.last_move).toBeNull();
    expect(turn.moves).toEqual([]);
    expect(turn.legal_moves).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(turn.deadline_ms).toBe(3000);
    expect(turn.served_at).toBe(new Date(clock.now()).toISOString());
  });

  it("después de la jugada del equipo responde la casa y vuelve el turno", async () => {
    const { arbiter, clock } = setup();
    const { game_id } = arbiter.createPractice(EQ4, {});
    await nextTurn(arbiter, EQ4);
    expect(arbiter.move(EQ4, { game_id, column: 3 }).body).toEqual({ ok: true, state: "playing", turn: 2 });
    clock.advance(0); // juega la casa
    const turn = await nextTurn(arbiter, EQ4);
    expect(turn.turn).toBe(3);
    expect(turn.moves).toEqual([3, 0]); // random = 0 → primera columna legal
    expect(turn.last_move).toEqual({ by: 2, column: 0 });
    expect(turn.board[0]).toEqual([2, 0, 0, 1, 0, 0, 0, 0]);
  });

  it("si abre la casa, el long polling recibe el turno en cuanto la casa juega", async () => {
    const { arbiter, clock } = setup();
    const { you } = arbiter.createPractice(EQ4, { opponent: "casa-aleatorio", first: 2 });
    expect(you).toBe(2);
    const handle = arbiter.next(EQ4, 20);
    clock.advance(0);
    const res = await handle.promise;
    expect(res.status).toBe("turn");
    expect((res as Turn).you).toBe(2);
    expect((res as Turn).turn).toBe(2);
  });

  it("valida rival y quién abre (400 validation)", () => {
    const { arbiter } = setup();
    expectError(() => arbiter.createPractice(EQ4, { opponent: "casa-experto" }), 400, "validation");
    expectError(() => arbiter.createPractice(EQ4, { first: 3 }), 400, "validation");
  });

  it("después del congelamiento responde 423 practice_closed", () => {
    const { arbiter } = setup();
    arbiter.phase = "frozen";
    expectError(() => arbiter.createPractice(EQ4, {}), 423, "practice_closed");
  });
});

describe("long polling", () => {
  it("sin turnos responde idle al vencer wait", async () => {
    const { arbiter, clock } = setup();
    const handle = arbiter.next(EQ4, 5);
    clock.advance(5000);
    expect(await handle.promise).toEqual({ status: "idle" });
  });

  it("con wait=0 responde idle de inmediato", async () => {
    const { arbiter } = setup();
    expect(await arbiter.next(EQ4, 0).promise).toEqual({ status: "idle" });
  });

  it("si el bot cancela (cerró la conexión), el turno no se marca como entregado", async () => {
    const { arbiter, clock } = setup();
    arbiter.createPractice(EQ4, { first: 2 });
    const handle = arbiter.next(EQ4, 20);
    handle.cancel();
    clock.advance(0); // juega la casa; nadie espera
    clock.advance(10_000);
    const turn = await nextTurn(arbiter, EQ4);
    // served_at es ahora, no cuando la casa jugó: el reloj de 3 s arranca al recoger el turno.
    expect(turn.served_at).toBe(new Date(clock.now()).toISOString());
  });

  it("con varias partidas devuelve el turno más antiguo", async () => {
    const { arbiter, clock } = setup();
    const a = arbiter.createPractice(EQ4, {});
    clock.advance(100);
    arbiter.createPractice(EQ4, {});
    expect((await nextTurn(arbiter, EQ4)).game_id).toBe(a.game_id);
  });
});

describe("jugadas", () => {
  it("una jugada tarde pierde por timeout (400) y la partida termina", async () => {
    const { arbiter, clock } = setup();
    const { game_id } = arbiter.createPractice(EQ4, {});
    await nextTurn(arbiter, EQ4);
    clock.advance(3412);
    const res = arbiter.move(EQ4, { game_id, column: 3 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ ok: false, error: "timeout", message: "La jugada llegó 412 ms después del límite." });
    const game = arbiter.getGame(game_id);
    expect(game.status).toBe("finished");
    expect(game.result).toEqual({ winner: 2, reason: "timeout", forfeited_by: 1, ms: 3412 });
  });

  it("si recoge el turno y nunca responde, pierde por timeout", async () => {
    const { arbiter, clock } = setup();
    const { game_id } = arbiter.createPractice(EQ4, {});
    await nextTurn(arbiter, EQ4);
    clock.advance(8000);
    expect(arbiter.getGame(game_id).result?.reason).toBe("timeout");
  });

  it("columna llena: 400 illegal_move y pierde", async () => {
    const { arbiter, clock } = setup();
    const { game_id } = arbiter.createPractice(EQ4, { opponent: "casa-aleatorio" });
    // El equipo y la casa (random = 0 → primera columna legal) juegan la columna 0 alternando.
    for (let i = 0; i < 3; i++) {
      await nextTurn(arbiter, EQ4);
      arbiter.move(EQ4, { game_id, column: 0 });
      clock.advance(0);
    }
    // Columna 0: X O X O X O (6 fichas). Turno 7 del equipo: cabe una más.
    await nextTurn(arbiter, EQ4);
    expect(arbiter.move(EQ4, { game_id, column: 0 }).body).toEqual({ ok: true, state: "playing", turn: 8 });
    clock.advance(0); // la casa ya no puede jugar la 0 y juega la 1
    await nextTurn(arbiter, EQ4);
    const res = arbiter.move(EQ4, { game_id, column: 0 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ ok: false, error: "illegal_move", message: "La columna 0 está llena." });
    expect(arbiter.getGame(game_id).result).toEqual({ winner: 2, reason: "illegal_move", forfeited_by: 1, ms: 0, column: 0 });
  });

  it.each([8, -1, 2.5, "3", null])("columna fuera de rango (%s): 400 illegal_move", async (column) => {
    const { arbiter } = setup();
    const { game_id } = arbiter.createPractice(EQ4, {});
    await nextTurn(arbiter, EQ4);
    const res = arbiter.move(EQ4, { game_id, column });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("illegal_move");
  });

  it("cuerpo sin game_id: 400 validation y la partida sigue", async () => {
    const { arbiter } = setup();
    const { game_id } = arbiter.createPractice(EQ4, {});
    expectError(() => arbiter.move(EQ4, { column: 3 }), 400, "validation");
    expectError(() => arbiter.move(EQ4, "no es objeto"), 400, "validation");
    expect(arbiter.getGame(game_id).status).toBe("playing");
  });

  it("partida inexistente: 409 unknown_game", () => {
    const { arbiter } = setup();
    expectError(() => arbiter.move(EQ4, { game_id: "g_x", column: 0 }), 409, "unknown_game");
  });

  it("jugar cuando no es su turno: 409 not_your_turn (no penaliza)", async () => {
    const { arbiter } = setup();
    const { game_id } = arbiter.createPractice(EQ4, {});
    await nextTurn(arbiter, EQ4);
    arbiter.move(EQ4, { game_id, column: 3 }); // ahora le toca a la casa
    expectError(() => arbiter.move(EQ4, { game_id, column: 3 }), 409, "not_your_turn");
    expectError(() => arbiter.move(PRUEBA, { game_id, column: 3 }), 409, "not_your_turn");
    expect(arbiter.getGame(game_id).status).toBe("playing");
  });

  it("no recoger el turno en 30 s: pierde por ausencia", () => {
    const { arbiter, clock } = setup();
    const { game_id } = arbiter.createPractice(EQ4, {});
    clock.advance(30_000);
    expect(arbiter.getGame(game_id).result).toEqual({ winner: 2, reason: "absent", forfeited_by: 1, waited_ms: 30_000 });
  });
});

describe("fin de partida (amistoso local entre dos equipos)", () => {
  it("la jugada que hace cuatro responde won con winning_cells", async () => {
    const { arbiter } = setup();
    const { game_id } = arbiter.createFriendly("eq4", "prueba");
    const play = async (team: Team, column: number) => {
      await nextTurn(arbiter, team);
      return arbiter.move(team, { game_id, column });
    };
    for (let i = 0; i < 3; i++) {
      await play(EQ4, 0);
      await play(PRUEBA, 1);
    }
    expect((await play(EQ4, 0)).body).toEqual({
      ok: true,
      state: "won",
      turn: 7,
      winning_cells: [[0, 0], [1, 0], [2, 0], [3, 0]],
    });
    const game = arbiter.getGame(game_id);
    expect(game.match_id).toBe("amistoso");
    expect(game.result).toEqual({ winner: 1, reason: "connect4", winning_cells: [[0, 0], [1, 0], [2, 0], [3, 0]] });
    expect(game.moves[0]).toEqual({ turn: 1, by: 1, column: 0, ms: 0 });
  });

  it("amistoso con equipos inexistentes: 400 validation", () => {
    const { arbiter } = setup();
    expectError(() => arbiter.createFriendly("eq4", "nadie"), 400, "validation");
  });
});

describe("rutas públicas y de equipo", () => {
  it("/api/games lista sin tablero, con team_id, más recientes primero y filtro por kind", () => {
    const { arbiter } = setup();
    const a = arbiter.createPractice(EQ4, {});
    const b = arbiter.createFriendly("eq4", "prueba");
    const list = arbiter.listGames();
    expect(list.map((g) => g.game_id)).toEqual([b.game_id, a.game_id]);
    expect("board" in list[0]!).toBe(false);
    expect(list[1]!.players).toEqual({
      "1": { team_id: "eq4", name: "Ocho por Siete" },
      "2": { team_id: "casa-basico", name: "casa-basico", house: true },
    });
    expect(arbiter.listGames("practice").map((g) => g.game_id)).toEqual([a.game_id]);
    expect(arbiter.listGames(undefined, "1")).toHaveLength(1);
    expectError(() => arbiter.listGames("torneo"), 400, "validation");
  });

  it("/api/games/{id} incluye el tablero; si no existe, 404 unknown_game", () => {
    const { arbiter } = setup();
    const { game_id } = arbiter.createPractice(EQ4, {});
    expect(arbiter.getGame(game_id).board).toHaveLength(7);
    expectError(() => arbiter.getGame("g_nope"), 404, "unknown_game");
  });

  it("/api/me muestra turnos pendientes; standing es null para equipos de prueba", () => {
    const { arbiter } = setup();
    const { game_id } = arbiter.createPractice(EQ4, {});
    const me = arbiter.me(EQ4);
    expect(me.pending_turns).toEqual([game_id]);
    expect(me.standing?.position).toBe(1);
    expect(me.submission).toBeNull();
    expect(me.phase).toBe("practice");
    expect(arbiter.me(PRUEBA).standing).toBeNull();
  });

  it("/api/me/submission valida repo y commit y guarda la entrega", () => {
    const { arbiter } = setup();
    expectError(() => arbiter.submit(EQ4, { repo_url: "https://gitlab.com/x/y", commit: "abc1234" }), 400, "validation");
    expectError(() => arbiter.submit(EQ4, { repo_url: "https://github.com/x/y", commit: "zzz" }), 400, "validation");
    const record = arbiter.submit(EQ4, { repo_url: "https://github.com/Claudia-98/ocho-por-siete", commit: "6a662f5" });
    expect(record.commit).toBe("6a662f5");
    expect(arbiter.me(EQ4).submission).toEqual(record);
    arbiter.phase = "frozen";
    expectError(() => arbiter.submit(EQ4, { repo_url: "https://github.com/x/y", commit: "abc1234" }), 423, "submissions_closed");
  });

  it("/api/standings no incluye equipos de prueba", () => {
    const { arbiter } = setup();
    expect(arbiter.standings().standings.map((s) => s.team.id)).toEqual(["eq4"]);
  });
});

describe("bots de la casa", () => {
  it("casa-basico gana si puede", () => {
    // La ficha en la columna 3 cae sobre la X de la fila 0 y completa OOOO en la fila 1.
    const board = picture(["OOO.....", "XXXO...."]);
    expect(immediateWin(board, 2)).toBe(3);
    expect(houseMove("casa-basico", board, 2, () => 0.99)).toBe(3);
  });

  it("casa-basico bloquea el cuatro inmediato del rival", () => {
    const board = picture(["XXX....O"]);
    expect(houseMove("casa-basico", board, 2, () => 0.99)).toBe(3);
  });

  it("casa-aleatorio elige entre las jugadas legales según el azar", () => {
    const board = picture(["XXX....O"]);
    expect(houseMove("casa-aleatorio", board, 2, () => 0)).toBe(0);
    expect(houseMove("casa-aleatorio", board, 2, () => 0.99)).toBe(7);
  });
});
