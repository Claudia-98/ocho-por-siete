import { describe, expect, it } from "vitest";
import {
  COLS,
  IllegalMoveError,
  ROWS,
  boardFromMoves,
  cellAt,
  countPieces,
  createBoard,
  dropPiece,
  isBoard,
  isColumnFull,
  landingRow,
  playerToMove,
} from "../../src/rules/index.js";
import { picture } from "../helpers.js";

describe("createBoard", () => {
  it("crea un tablero vacío de 7 filas × 8 columnas", () => {
    const board = createBoard();
    expect(board).toHaveLength(ROWS);
    for (const row of board) expect(row).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(COLS).toBe(8);
  });
});

describe("dropPiece: caída de fichas", () => {
  it("la primera ficha cae a la fila 0 (abajo)", () => {
    const { board, row } = dropPiece(createBoard(), 3, 1);
    expect(row).toBe(0);
    expect(cellAt(board, 0, 3)).toBe(1);
  });

  it("las fichas se apilan en la misma columna", () => {
    let board = createBoard();
    board = dropPiece(board, 5, 1).board;
    board = dropPiece(board, 5, 2).board;
    const third = dropPiece(board, 5, 1);
    expect(third.row).toBe(2);
    expect(third.board.map((r) => r[5])).toEqual([1, 2, 1, 0, 0, 0, 0]);
  });

  it("no modifica el tablero original", () => {
    const original = createBoard();
    dropPiece(original, 0, 1);
    expect(countPieces(original)).toBe(0);
  });

  it("funciona en las columnas de los bordes, 0 y 7", () => {
    expect(dropPiece(createBoard(), 0, 1).board[0]).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(dropPiece(createBoard(), 7, 2).board[0]).toEqual([0, 0, 0, 0, 0, 0, 0, 2]);
  });

  it("rechaza una columna llena con IllegalMoveError", () => {
    const full = boardFromMoves([2, 2, 2, 2, 2, 2, 2]); // 7 fichas = columna llena
    expect(isColumnFull(full, 2)).toBe(true);
    expect(() => dropPiece(full, 2, 1)).toThrow(IllegalMoveError);
  });

  it.each([-1, 8, 3.5, Number.NaN])("rechaza la columna fuera de rango %s", (col) => {
    expect(() => dropPiece(createBoard(), col, 1)).toThrow(IllegalMoveError);
  });
});

describe("landingRow", () => {
  it("indica la fila donde caería la próxima ficha y null si está llena", () => {
    const board = picture(["O.......", "X.......", "X......."]);
    expect(landingRow(board, 0)).toBe(3);
    expect(landingRow(board, 1)).toBe(0);
    expect(landingRow(boardFromMoves([7, 7, 7, 7, 7, 7, 7]), 7)).toBeNull();
  });
});

describe("boardFromMoves", () => {
  it("alterna jugadores empezando por el 1", () => {
    const board = boardFromMoves([3, 4, 3]);
    expect(board[0]).toEqual([0, 0, 0, 1, 2, 0, 0, 0]);
    expect(board[1]).toEqual([0, 0, 0, 1, 0, 0, 0, 0]);
  });

  it("coincide con el dibujo equivalente", () => {
    expect(boardFromMoves([3, 2, 3, 2, 4, 3, 2, 3])).toEqual(
      picture([
        "...O....",
        "..XO....",
        "..OX....",
        "..OXX...",
      ]),
    );
  });

  it("lanza IllegalMoveError si una jugada intermedia es ilegal", () => {
    expect(() => boardFromMoves([0, 0, 0, 0, 0, 0, 0, 0])).toThrow(IllegalMoveError);
  });
});

describe("playerToMove", () => {
  it("le toca al 1 con el tablero vacío y con fichas parejas", () => {
    expect(playerToMove(createBoard())).toBe(1);
    expect(playerToMove(boardFromMoves([3, 4]))).toBe(1);
  });

  it("le toca al 2 cuando el 1 tiene una ficha más", () => {
    expect(playerToMove(boardFromMoves([3]))).toBe(2);
    expect(playerToMove(boardFromMoves([3, 4, 5]))).toBe(2);
  });
});

describe("isBoard", () => {
  it("acepta un tablero 7×8 con valores 0, 1 y 2", () => {
    expect(isBoard(createBoard())).toBe(true);
    expect(isBoard(boardFromMoves([1, 2, 3]))).toBe(true);
  });

  it("rechaza tamaños o valores inválidos", () => {
    expect(isBoard(null)).toBe(false);
    expect(isBoard([[0, 0, 0]])).toBe(false);
    expect(isBoard(Array(6).fill(Array(7).fill(0)))).toBe(false); // 7×6 clásico
    const bad = createBoard().map((r) => [...r]) as unknown[][];
    bad[0]![0] = 3;
    expect(isBoard(bad)).toBe(false);
  });
});
