import { describe, expect, it } from "vitest";
import { Position, WEIGHTS, WINDOWS, chooseMove, evaluate, index } from "../../src/engine/index.js";
import { boardFromMoves, createBoard } from "../../src/rules/index.js";
import { picture } from "../helpers.js";

describe("Position", () => {
  it("fromBoard copia el tablero del árbitro y respeta a quién le toca", () => {
    const board = boardFromMoves([3, 4, 3]);
    const pos = Position.fromBoard(board, 2);
    expect(pos.count).toBe(3);
    expect(pos.current).toBe(2);
    expect(pos.cells[index(0, 3)]).toBe(1);
    expect(pos.cells[index(1, 3)]).toBe(1);
    expect(pos.cells[index(0, 4)]).toBe(2);
    expect([...pos.heights]).toEqual([0, 0, 0, 2, 1, 0, 0, 0]);
  });

  it("jugar y deshacer deja la posición y el hash exactamente igual", () => {
    const pos = Position.fromBoard(boardFromMoves([3, 4, 2]), 2);
    const before = { cells: [...pos.cells], lo: pos.hashLo, hi: pos.hashHi, current: pos.current, count: pos.count };
    for (const col of [5, 5, 0, 7]) pos.play(col);
    for (const col of [7, 0, 5, 5]) pos.undo(col);
    expect({ cells: [...pos.cells], lo: pos.hashLo, hi: pos.hashHi, current: pos.current, count: pos.count }).toEqual(before);
  });

  it("el hash es el mismo si se llega a la misma posición por caminos distintos", () => {
    const a = Position.fromBoard(createBoard(), 1);
    const b = Position.fromBoard(createBoard(), 1);
    for (const col of [3, 4, 2]) a.play(col);
    for (const col of [2, 4, 3]) b.play(col);
    expect([a.hashLo, a.hashHi]).toEqual([b.hashLo, b.hashHi]);
  });

  it("el hash distingue a quién le toca", () => {
    const board = boardFromMoves([3, 4]);
    expect(Position.fromBoard(board, 1).hashLo === Position.fromBoard(board, 2).hashLo).toBe(false);
  });

  it("canPlay rechaza columnas llenas y fuera de rango", () => {
    const pos = Position.fromBoard(boardFromMoves([0, 0, 0, 0, 0, 0, 0]), 2);
    expect(pos.canPlay(0)).toBe(false);
    expect(pos.canPlay(-1)).toBe(false);
    expect(pos.canPlay(8)).toBe(false);
    expect(pos.canPlay(7)).toBe(true);
  });

  it("isWinningMove y winningColumnsFor coinciden con las reglas", () => {
    const board = picture(["OOO.....", "XXXO...."]);
    const pos = Position.fromBoard(board, 1);
    expect(pos.isWinningMove(3)).toBe(false); // la X en la 3 cae en la fila 1: no hace cuatro
    expect(pos.winningColumnsFor(2)).toEqual([3]);
    expect(pos.winningColumnsFor(1)).toEqual([]);
    expect(pos.current).toBe(1); // no cambia a quién le toca
  });

  it("lastMoveWins detecta las 4 direcciones en los bordes del 8×7", () => {
    const cases: Array<{ moves: number[]; last: number }> = [
      { moves: [4, 0, 5, 0, 6, 0, 7], last: 7 }, // horizontal hasta la columna 7
      { moves: [7, 0, 7, 0, 7, 0, 7], last: 7 }, // vertical en la columna 7
      { moves: [0, 1, 1, 2, 2, 3, 2, 3, 3, 0, 3], last: 3 }, // diagonal ↗ desde la esquina
    ];
    for (const { moves, last } of cases) {
      const pos = Position.fromBoard(boardFromMoves(moves.slice(0, -1)), moves.length % 2 === 1 ? 1 : 2);
      pos.play(last);
      expect(pos.lastMoveWins(last)).toBe(true);
    }
  });
});

describe("evaluate (heurística)", () => {
  it("hay 107 ventanas de 4 en el tablero 8×7", () => {
    expect(WINDOWS).toHaveLength(107);
  });

  it("el tablero vacío vale 0", () => {
    expect(evaluate(Position.fromBoard(createBoard(), 1))).toBe(0);
  });

  it("es simétrica: reflejar el tablero de izquierda a derecha no cambia el valor", () => {
    const board = picture(["..O.....", ".XXO....", "XOOX...."]);
    const mirrored = board.map((row) => [...row].reverse());
    expect(evaluate(Position.fromBoard(mirrored, 1))).toBe(evaluate(Position.fromBoard(board, 1)));
  });

  it("tener tres en línea con espacio vale más que no tenerlo", () => {
    const threat = Position.fromBoard(picture(["OO......", "XXX....."]), 1);
    const scattered = Position.fromBoard(picture(["OO......", "X.X...X."]), 1);
    expect(evaluate(threat) > evaluate(scattered)).toBe(true);
  });

  it("prefiere fichas en el centro (columnas 3 y 4)", () => {
    const center = Position.fromBoard(picture(["...X...O"]), 1);
    const edge = Position.fromBoard(picture(["X......O"]), 1);
    expect(evaluate(center) > evaluate(edge)).toBe(true);
  });
});

describe("evaluate con pesos como parámetro", () => {
  const board = picture(["OO......", "XXX....."]);

  it("sin pesos usa WEIGHTS (el comportamiento del torneo no cambia)", () => {
    const pos = Position.fromBoard(board, 1);
    expect(evaluate(pos)).toBe(evaluate(pos, WEIGHTS));
  });

  it("duplicar `center` duplica el valor de una ficha sola en la columna 3", () => {
    const pos = Position.fromBoard(picture(["...X...."]), 1);
    expect(evaluate(pos)).toBe(WEIGHTS.center);
    expect(evaluate(pos, { ...WEIGHTS, center: 2 * WEIGHTS.center })).toBe(2 * WEIGHTS.center);
  });

  it("subir `three` sube el valor de un tres en línea propio en esa misma diferencia", () => {
    const pos = Position.fromBoard(board, 1);
    const diff = evaluate(pos, { ...WEIGHTS, three: WEIGHTS.three + 15 }) - evaluate(pos);
    // XXX en la fila 0 deja dos ventanas con tres propias y una vacía: columnas 0–3 (la 1–4 tiene dos vacías).
    expect(diff).toBe(15);
  });

  it("subir `oppThree` castiga más el tres en línea del rival", () => {
    const pos = Position.fromBoard(board, 2); // le toca a O; las X son del rival
    const diff = evaluate(pos, { ...WEIGHTS, oppThree: WEIGHTS.oppThree + 20 }) - evaluate(pos);
    expect(diff).toBe(-20);
  });

  it("chooseMove usa los pesos que recibe: con el centro castigado deja de abrir en 3 o 4", () => {
    const empty = picture(["........"]);
    const legal = [0, 1, 2, 3, 4, 5, 6, 7];
    const opts = { budgetMs: 1000, now: () => 0, maxDepth: 1, tt: null };
    expect([3, 4]).toContain(chooseMove(empty, 1, legal, opts).column);
    const edgy = chooseMove(empty, 1, legal, { ...opts, weights: { ...WEIGHTS, center: -100 } });
    expect([3, 4]).not.toContain(edgy.column);
  });
});
