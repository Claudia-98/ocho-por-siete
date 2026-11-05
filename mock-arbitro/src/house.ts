// Bots de la casa, como los describe el OpenAPI:
// casa-aleatorio juega al azar; casa-basico gana y bloquea cuatros inmediatos.
import { dropPiece, legalMoves, winningLineThrough, type Board, type Player } from "../../backend/src/rules/index.js";
import type { HouseBot } from "./types.js";

/** Devuelve un número en [0, 1). Se inyecta para que las pruebas sean deterministas. */
export type Random = () => number;

function pick<T>(items: readonly T[], random: Random): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error("No hay jugadas legales.");
  return item;
}

/** Columna donde `player` gana de inmediato, o null. */
export function immediateWin(board: Board, player: Player): number | null {
  for (const col of legalMoves(board)) {
    const { board: next, row } = dropPiece(board, col, player);
    if (winningLineThrough(next, row, col)) return col;
  }
  return null;
}

export function houseMove(bot: HouseBot, board: Board, me: Player, random: Random): number {
  const moves = legalMoves(board);
  if (bot === "casa-basico") {
    const win = immediateWin(board, me);
    if (win !== null) return win;
    const block = immediateWin(board, me === 1 ? 2 : 1);
    if (block !== null) return block;
  }
  return pick(moves, random);
}
