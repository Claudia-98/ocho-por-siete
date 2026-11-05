import { describe, expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import {
  INF,
  MOVE_ORDER,
  Position,
  Searcher,
  TimeUp,
  TranspositionTable,
  WIN,
  chooseMove,
  evaluate,
  isForced,
  seededRandom,
} from "../../src/engine/index.js";
import { boardFromMoves, createBoard, dropPiece, findWinner, legalMoves, type Board, type Player } from "../../src/rules/index.js";
import { fullDrawBoard, picture } from "../helpers.js";

const now = () => performance.now();
const FAST = { budgetMs: 200, now };

/** Minimax sin poda, con las mismas reglas por nodo que negamax. Solo para comparar. */
function minimax(pos: Position, depth: number): number {
  if (pos.isFull()) return 0;
  for (const col of MOVE_ORDER) if (pos.isWinningMove(col)) return WIN - (pos.count + 1);
  if (depth === 0) return evaluate(pos);
  let best = -INF;
  for (let col = 0; col < 8; col++) {
    if (!pos.canPlay(col)) continue;
    pos.play(col);
    best = Math.max(best, -minimax(pos, depth - 1));
    pos.undo(col);
  }
  return best;
}

/** Posiciones de partida aleatorias (con semilla) que todavía no terminaron. */
function randomPositions(count: number, seed: number, minMoves = 4, maxMoves = 30): Array<{ board: Board; player: Player }> {
  const rand = seededRandom(seed);
  const out: Array<{ board: Board; player: Player }> = [];
  while (out.length < count) {
    let board = createBoard();
    let player: Player = 1;
    const n = minMoves + Math.floor(rand() * (maxMoves - minMoves));
    let ended = false;
    for (let i = 0; i < n; i++) {
      const moves = legalMoves(board);
      board = dropPiece(board, moves[Math.floor(rand() * moves.length)]!, player).board;
      player = player === 1 ? 2 : 1;
      if (findWinner(board)) {
        ended = true;
        break;
      }
    }
    if (!ended && legalMoves(board).length > 0) out.push({ board, player });
  }
  return out;
}

describe("chooseMove: táctica", () => {
  it("gana en una jugada (horizontal)", () => {
    // Fila 0: X X X O; fila 1: O O O. Le toca a O (2): la ficha en la columna 3 cae en la fila 1 y gana.
    const board = picture(["OOO.....", "XXXO...."]);
    const d = chooseMove(board, 2, legalMoves(board), FAST);
    expect(d.column).toBe(3);
    expect(d.stats.reason).toBe("win-now");
  });

  it("bloquea el cuatro inmediato del rival", () => {
    const board = picture(["XXX....O"]);
    // Se agrega otra O para que las fichas cuadren con que le toque a O.
    const withO = dropPiece(board, 7, 2).board;
    const d = chooseMove(withO, 2, legalMoves(withO), FAST);
    expect(d.column).toBe(3);
    expect(d.stats.reason).toBe("block");
  });

  it("si puede ganar o bloquear, gana", () => {
    // X amenaza la columna 3 (fila 0); O puede ganar en la columna 7 (vertical).
    const board = picture([".......O", ".......O", "XXX....O"]);
    const d = chooseMove(board, 2, legalMoves(board), FAST);
    expect(d.column).toBe(7);
  });

  it("gana en dos: arma una doble amenaza (tres abiertos por ambos lados)", () => {
    // Fila 0: ..XX...O con O encima en la 7. Le toca a X: jugar 1 o 4 deja _XXX_ y O no puede tapar ambos.
    const board = picture([".......O", "..XX...O"]);
    const d = chooseMove(board, 1, legalMoves(board), FAST);
    expect([1, 4].includes(d.column)).toBe(true);
    expect(isForced(d.stats.score) && d.stats.score > 0).toBe(true);
  });

  it("no regala la casilla ganadora del rival (no juega debajo de ella)", () => {
    // O tiene tres en la fila 1 (columnas 0–2) y le falta (1,3), que todavía no es jugable
    // porque (0,3) está vacía. Si X juega la columna 3, O gana encima.
    const board = picture(["OOO.....", "XXO....X"]);
    const d = chooseMove(board, 1, legalMoves(board), FAST);
    expect(d.column === 3).toBe(false);
  });
});

describe("chooseMove: garantías de las bases", () => {
  it("nunca devuelve una jugada ilegal (200 posiciones aleatorias)", () => {
    for (const { board, player } of randomPositions(200, 42)) {
      const legal = legalMoves(board);
      const d = chooseMove(board, player, legal, { budgetMs: 20, now });
      expect(legal.includes(d.column)).toBe(true);
    }
  });

  it("respeta el presupuesto de tiempo (con margen de 100 ms)", () => {
    for (const budgetMs of [100, 300]) {
      const t0 = performance.now();
      const d = chooseMove(createBoard(), 1, legalMoves(createBoard()), { budgetMs, now, tt: null });
      const real = performance.now() - t0;
      expect(real <= budgetMs + 100).toBe(true);
      expect(d.stats.ms <= budgetMs + 100).toBe(true);
      expect(d.stats.depth >= 1).toBe(true);
    }
  });

  it("con una sola columna disponible la devuelve sin buscar", () => {
    const board = fullDrawBoard();
    board[6]![5] = 0;
    const d = chooseMove(board, 2, [5], FAST);
    expect(d.column).toBe(5);
    expect(d.stats.reason).toBe("only-move");
  });

  it("con el tablero a punto de llenarse (dos casillas) devuelve una de ellas", () => {
    const board = fullDrawBoard();
    board[6]![1] = 0;
    board[6]![6] = 0;
    const d = chooseMove(board, 1, [1, 6], FAST);
    expect([1, 6].includes(d.column)).toBe(true);
  });

  it("solo juega columnas que el árbitro lista en legal_moves", () => {
    const board = createBoard();
    for (let i = 0; i < 20; i++) {
      const d = chooseMove(board, 1, [0, 7], { budgetMs: 30, now });
      expect([0, 7].includes(d.column)).toBe(true);
    }
  });

  it("si legal_moves no coincide con el tablero, igual devuelve algo de legal_moves", () => {
    const full = boardFromMoves([2, 2, 2, 2, 2, 2, 2]); // columna 2 llena
    const d = chooseMove(full, 2, [2], FAST);
    expect(d.column).toBe(2); // el árbitro manda; preferimos no inventar columnas
  });

  it("con legal_moves vacío no lanza error", () => {
    const d = chooseMove(createBoard(), 1, [], FAST);
    expect(d.stats.reason).toBe("fallback");
  });

  it("si el reloj falla, cae a la red de seguridad con una jugada legal", () => {
    let calls = 0;
    const brokenClock = () => {
      calls++;
      if (calls > 3) throw new Error("reloj roto");
      return 0;
    };
    const d = chooseMove(createBoard(), 1, [0, 1, 2], { budgetMs: 100, now: brokenClock });
    expect([0, 1, 2].includes(d.column)).toBe(true);
  });

  it("es determinista: la misma posición da la misma jugada a profundidad fija", () => {
    const board = boardFromMoves([3, 4, 2, 5]);
    const a = chooseMove(board, 1, legalMoves(board), { budgetMs: 10_000, now, maxDepth: 6, tt: null });
    const b = chooseMove(board, 1, legalMoves(board), { budgetMs: 10_000, now, maxDepth: 6, tt: null });
    expect(a.column).toBe(b.column);
    expect(a.stats.score).toBe(b.stats.score);
  });
});

describe("búsqueda: la poda no cambia el resultado", () => {
  const positions = randomPositions(12, 7, 6, 24);

  it("alfa-beta da el mismo valor que minimax sin poda (profundidad 4)", () => {
    for (const { board, player } of positions) {
      const expected = minimax(Position.fromBoard(board, player), 4);
      const got = new Searcher(Position.fromBoard(board, player), { tt: null }).negamax(4, -INF, INF);
      expect(got).toBe(expected);
    }
  });

  it("con tabla de transposición da el mismo valor que minimax (profundidad 4)", () => {
    for (const { board, player } of positions) {
      const expected = minimax(Position.fromBoard(board, player), 4);
      const got = new Searcher(Position.fromBoard(board, player), { tt: new TranspositionTable(16) }).negamax(4, -INF, INF);
      expect(got).toBe(expected);
    }
  });

  it("la poda visita muchos menos nodos que minimax", () => {
    const pos = Position.fromBoard(createBoard(), 1);
    const s = new Searcher(pos, { tt: null });
    s.negamax(6, -INF, INF);
    expect(s.nodes < 8 ** 6 / 10).toBe(true); // minimax visitaría del orden de 8^6 = 262,144 hojas
  });

  it("al acabarse el tiempo lanza TimeUp y deja la posición intacta", () => {
    const pos = Position.fromBoard(boardFromMoves([3, 4]), 1);
    const snapshot = [...pos.cells];
    let t = 0;
    const s = new Searcher(pos, { tt: null, now: () => (t += 1), deadline: 50 });
    let thrown: unknown;
    try {
      s.negamax(12, -INF, INF);
    } catch (e) {
      thrown = e;
    }
    expect(thrown instanceof TimeUp).toBe(true);
    expect([...pos.cells]).toEqual(snapshot);
    expect(pos.count).toBe(2);
  });
});
