// Comparación motor contra motor, sin HTTP: la versión actual contra una variante de pesos
// que puede cambiar según quién abrió la partida (jugador 1) o quién responde (jugador 2).
// Uso: npm run compare -w backend -- <variante> [partidas] [ms por jugada] [semilla]
//   variante: A | B | C | igual   (ver VARIANTS)
// Método (docs/HALLAZGOS.md §2): apertura aleatoria de 4 jugadas con semilla; cada apertura se
// juega dos veces cambiando quién abre, así las dos versiones reciben las mismas posiciones.
// Mide fuerza; no es una prueba unitaria.
import { performance } from "node:perf_hooks";
import { chooseMove, seededRandom, TranspositionTable, WEIGHTS, type Weights } from "../src/engine/index.js";
import { createBoard, dropPiece, legalMoves, winningLineThrough, type Board, type Player } from "../src/rules/index.js";

/** Pesos de la variante según el número de jugador que le tocó en la partida. */
type Variant = (side: Player) => Weights;

const AGGRESSIVE: Weights = { ...WEIGHTS, center: 6, three: 65 };
const DEFENSIVE: Weights = { ...WEIGHTS, oppThree: 80, oppTwo: 15 };

const VARIANTS: Record<string, Variant> = {
  /** Agresivo al abrir: más centro y más ataque solo si somos el jugador 1. */
  A: (side) => (side === 1 ? AGGRESSIVE : WEIGHTS),
  /** Defensivo al responder: más defensa solo si somos el jugador 2. */
  B: (side) => (side === 2 ? DEFENSIVE : WEIGHTS),
  /** A y B juntas. */
  C: (side) => (side === 1 ? AGGRESSIVE : DEFENSIVE),
  /** Control: la actual contra sí misma (debería quedar pareja). */
  igual: () => WEIGHTS,
};

const [variantArg = "A", gamesArg = "72", budgetArg = "250", seedArg = "2026"] = process.argv.slice(2);
const variant = VARIANTS[variantArg];
if (!variant) {
  console.error(`Variante desconocida "${variantArg}". Opciones: ${Object.keys(VARIANTS).join(", ")}`);
  process.exit(1);
}
const games = Number(gamesArg);
const budgetMs = Number(budgetArg);
const seed = Number(seedArg);
const random = seededRandom(seed);
const now = () => performance.now();
const OPENING_PLIES = 4;

function randomOpening(): number[] {
  let board = createBoard();
  const moves: number[] = [];
  let player: Player = 1;
  for (let i = 0; i < OPENING_PLIES; i++) {
    const legal = legalMoves(board);
    const col = legal[Math.floor(random() * legal.length)]!;
    board = dropPiece(board, col, player).board;
    moves.push(col);
    player = player === 1 ? 2 : 1;
  }
  return moves;
}

type Result = "won" | "lost" | "draw";

/** Juega una partida y devuelve el resultado desde el punto de vista de la variante. */
function playGame(opening: readonly number[], variantSide: Player): { result: Result; plies: number } {
  const variantWeights = variant!(variantSide);
  const ttVariant = new TranspositionTable(20);
  const ttBase = new TranspositionTable(20);
  let board: Board = createBoard();
  let player: Player = 1;
  let plies = 0;
  while (legalMoves(board).length > 0) {
    const legal = legalMoves(board);
    const col =
      plies < opening.length
        ? opening[plies]!
        : player === variantSide
          ? chooseMove(board, player, legal, { budgetMs, now, tt: ttVariant, weights: variantWeights }).column
          : chooseMove(board, player, legal, { budgetMs, now, tt: ttBase }).column;
    const drop = dropPiece(board, col, player);
    board = drop.board;
    plies++;
    if (winningLineThrough(board, drop.row, col)) return { result: player === variantSide ? "won" : "lost", plies };
    player = player === 1 ? 2 : 1;
  }
  return { result: "draw", plies };
}

const tally = { 1: { won: 0, draw: 0, lost: 0 }, 2: { won: 0, draw: 0, lost: 0 } };
let opening: number[] = [];
for (let g = 0; g < games; g++) {
  if (g % 2 === 0) opening = randomOpening();
  const variantSide: Player = g % 2 === 0 ? 1 : 2;
  const { result, plies } = playGame(opening, variantSide);
  tally[variantSide][result]++;
  console.log(
    `Partida ${g + 1}: apertura [${opening.join(",")}], abre ${variantSide === 1 ? "la variante" : "la actual"} → variante ${result} en ${plies} jugadas`,
  );
}

const line = (label: string, t: { won: number; draw: number; lost: number }) =>
  `  ${label.padEnd(26)} variante ${t.won} · empates ${t.draw} · actual ${t.lost}`;
const total = { won: tally[1].won + tally[2].won, draw: tally[1].draw + tally[2].draw, lost: tally[1].lost + tally[2].lost };
console.log(`\nVariante ${variantArg}, ${games} partidas, ${budgetMs} ms por jugada, semilla ${seed}:`);
console.log(line("Total", total));
console.log(line("Abre la variante (J1)", tally[1]));
console.log(line("Abre la actual (var. J2)", tally[2]));
