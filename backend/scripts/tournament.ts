// Torneo local, sin HTTP: nuestro motor contra los bots de la casa del mock.
// Uso: npm run tournament -w backend -- [rival] [partidas] [ms por jugada]
//   rival: casa-basico | casa-aleatorio   (por defecto casa-basico)
// Mide fuerza; no es una prueba unitaria (las bases: "eso lo mide el torneo").
import { performance } from "node:perf_hooks";
import { chooseMove } from "../src/engine/index.js";
import { createBoard, dropPiece, legalMoves, winningLineThrough, type Board, type Player } from "../src/rules/index.js";
import { houseMove } from "../../mock-arbitro/src/house.js";
import { seededRandom } from "../src/engine/position.js";
import type { HouseBot } from "../../mock-arbitro/src/types.js";

const [rivalArg = "casa-basico", gamesArg = "20", budgetArg = "300"] = process.argv.slice(2);
const rival = rivalArg as HouseBot;
const games = Number(gamesArg);
const budgetMs = Number(budgetArg);
const random = seededRandom(2026);
const now = () => performance.now();

let won = 0;
let drawn = 0;
let lost = 0;
const depths: number[] = [];
let maxMs = 0;

for (let g = 0; g < games; g++) {
  const us: Player = g % 2 === 0 ? 1 : 2; // alternamos quién abre
  let board: Board = createBoard();
  let player: Player = 1;
  const moves: number[] = [];
  let result: "won" | "lost" | "draw" = "draw";
  while (legalMoves(board).length > 0) {
    let col: number;
    if (player === us) {
      const d = chooseMove(board, player, legalMoves(board), { budgetMs, now });
      col = d.column;
      if (d.stats.reason === "search") depths.push(d.stats.depth);
      maxMs = Math.max(maxMs, d.stats.ms);
    } else {
      col = houseMove(rival, board, player, random);
    }
    const drop = dropPiece(board, col, player);
    board = drop.board;
    moves.push(col);
    if (winningLineThrough(board, drop.row, col)) {
      result = player === us ? "won" : "lost";
      break;
    }
    player = player === 1 ? 2 : 1;
  }
  if (result === "won") won++;
  else if (result === "lost") lost++;
  else drawn++;
  console.log(`Partida ${g + 1}: abre ${us === 1 ? "nuestro bot" : rival} → ${result} en ${moves.length} jugadas  [${moves.join(",")}]`);
}

const avgDepth = depths.length ? depths.reduce((a, b) => a + b, 0) / depths.length : 0;
console.log(`\nContra ${rival}, ${games} partidas, ${budgetMs} ms por jugada:`);
console.log(`  Ganadas ${won} · Empates ${drawn} · Perdidas ${lost}`);
console.log(`  Profundidad media ${avgDepth.toFixed(1)} (mín ${Math.min(...depths)}, máx ${Math.max(...depths)}) · jugada más lenta ${maxMs} ms`);
