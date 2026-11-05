import { describe, expect, it } from "vitest";
import {
  boardFromMoves,
  createBoard,
  findWinner,
  gameState,
  isFull,
  legalMoves,
  winningLineThrough,
} from "../../src/rules/index.js";
import { fullDrawBoard, picture } from "../helpers.js";

describe("legalMoves", () => {
  it("con el tablero vacío son las 8 columnas", () => {
    expect(legalMoves(createBoard())).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("excluye las columnas llenas", () => {
    const board = boardFromMoves([0, 0, 0, 0, 0, 0, 0, 7, 7, 7, 7, 7, 7, 7]);
    expect(legalMoves(board)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("con una sola columna disponible devuelve solo esa", () => {
    const board = fullDrawBoard();
    board[6]![5] = 0; // se vacía la casilla de arriba de la columna 5
    expect(legalMoves(board)).toEqual([5]);
  });
});

describe("victoria: las cuatro direcciones", () => {
  it("horizontal", () => {
    const board = picture(["OOO.....", "XXXX...."]);
    expect(findWinner(board)).toEqual({ player: 1, cells: [[0, 0], [0, 1], [0, 2], [0, 3]] });
  });

  it("horizontal que termina en la columna 7", () => {
    const board = picture(["....OOOO", "...XXXOX"]);
    expect(findWinner(board)?.player).toBe(2);
    expect(findWinner(board)?.cells).toEqual([[1, 4], [1, 5], [1, 6], [1, 7]]);
  });

  it("vertical que llega a la fila 6 (arriba)", () => {
    const board = picture([
      "......O.",
      "......O.",
      "......O.",
      "......O.",
      "......X.",
      "......X.",
      "......X.",
    ]);
    expect(findWinner(board)).toEqual({ player: 2, cells: [[3, 6], [4, 6], [5, 6], [6, 6]] });
  });

  it("diagonal ↗", () => {
    const board = picture([
      "...X....",
      "..XO....",
      ".XOO....",
      "XOOX....",
    ]);
    expect(findWinner(board)).toEqual({ player: 1, cells: [[0, 0], [1, 1], [2, 2], [3, 3]] });
  });

  it("diagonal ↘ que termina en la esquina inferior derecha (columna 7)", () => {
    const board = picture([
      "....O...",
      "....XO..",
      "....XXO.",
      "....XXXO",
    ]);
    expect(findWinner(board)).toEqual({ player: 2, cells: [[3, 4], [2, 5], [1, 6], [0, 7]] });
  });

  it("devuelve toda la línea cuando hay más de cuatro seguidas", () => {
    const board = picture(["OOOO....", "XXXXX..."]);
    // Se revisa por la ficha de la columna 4: la línea va de 0 a 4.
    expect(winningLineThrough(board, 0, 4)).toHaveLength(5);
  });
});

describe("victoria: casos que NO deben ganar", () => {
  it("tres en línea no gana", () => {
    expect(findWinner(picture(["XXX.OOO."]))).toBeNull();
  });

  it("no une el final de una fila con el inicio de la siguiente", () => {
    // Columnas 6–7 de la fila 0 y columnas 0–1 de la fila 1: no son consecutivas.
    const board = picture(["XX......", "OOOXOOXX"]);
    expect(findWinner(board)).toBeNull();
  });

  it("cuatro fichas mezcladas no ganan", () => {
    expect(findWinner(picture(["XXOX...."]))).toBeNull();
  });

  it("winningLineThrough en una casilla vacía devuelve null", () => {
    expect(winningLineThrough(createBoard(), 0, 0)).toBeNull();
  });
});

describe("gameState", () => {
  it("partida nueva: sigue, le toca al 1 y las 8 columnas son legales", () => {
    expect(gameState(createBoard())).toEqual({
      status: "playing",
      nextPlayer: 1,
      winner: null,
      winningCells: [],
      legalMoves: [0, 1, 2, 3, 4, 5, 6, 7],
    });
  });

  it("partida ganada: sin turno ni jugadas legales, con las casillas ganadoras", () => {
    const state = gameState(boardFromMoves([0, 1, 0, 1, 0, 1, 0])); // vertical del 1 en columna 0
    expect(state.status).toBe("won");
    expect(state.winner).toBe(1);
    expect(state.nextPlayer).toBeNull();
    expect(state.legalMoves).toEqual([]);
    expect(state.winningCells).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
  });

  it("empate: las 56 casillas llenas sin ganador", () => {
    const board = fullDrawBoard();
    expect(isFull(board)).toBe(true);
    expect(findWinner(board)).toBeNull();
    expect(gameState(board)).toEqual({
      status: "draw",
      nextPlayer: null,
      winner: null,
      winningCells: [],
      legalMoves: [],
    });
  });

  it("tablero a punto de llenarse: sigue con una jugada legal", () => {
    const board = fullDrawBoard();
    board[6]![2] = 0;
    const state = gameState(board);
    expect(isFull(board)).toBe(false);
    expect(state.status).toBe("playing");
    expect(state.legalMoves).toEqual([2]);
  });

  it("si el tablero lleno tiene un cuatro en línea, gana (no es empate)", () => {
    const board = fullDrawBoard();
    // Fila 0 es [2,2,1,1,2,2,1,1]: se cambian las columnas 2 y 3 para formar 2,2,2,2.
    board[0]![2] = 2;
    board[0]![3] = 2;
    expect(gameState(board).status).toBe("won");
    expect(gameState(board).winner).toBe(2);
  });
});
