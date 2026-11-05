// Representación interna rápida para la búsqueda: arreglo plano mutable con jugar/deshacer en O(1).
// El formato del árbitro (board[fila][columna]) se convierte aquí, en un solo lugar.
import { CELLS, COLS, CONNECT, ROWS, type Board, type Player } from "../rules/index.js";

/** Índice plano de (fila, columna). Fila 0 = abajo. */
export const index = (row: number, col: number): number => row * COLS + col;

/** Generador pseudoaleatorio con semilla (mulberry32): mismos hashes en cada ejecución. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash Zobrist: un número aleatorio de 32 bits por (casilla, jugador), en dos mitades
// para reducir colisiones. `lo` indexa la tabla de transposición y `hi` verifica.
const rand = seededRandom(0x8a7c);
const rand32 = () => (rand() * 4294967296) | 0;
// Índice: (jugador − 1) * 56 + casilla.
const ZOBRIST_LO = new Int32Array(2 * CELLS);
const ZOBRIST_HI = new Int32Array(2 * CELLS);
for (let k = 0; k < 2 * CELLS; k++) {
  ZOBRIST_LO[k] = rand32();
  ZOBRIST_HI[k] = rand32();
}
const SIDE_LO = rand32();
const SIDE_HI = rand32();

/** Las 4 direcciones como [Δfila, Δcolumna]. */
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [-1, 1],
];

export class Position {
  /** 0 vacío, 1 o 2. Índice = fila * 8 + columna. */
  readonly cells = new Int8Array(CELLS);
  /** Fichas en cada columna (= fila donde cae la siguiente). */
  readonly heights = new Uint8Array(COLS);
  /** Jugador al que le toca. */
  current: Player = 1;
  /** Fichas en el tablero. */
  count = 0;
  hashLo = 0;
  hashHi = 0;

  /** Crea la posición a partir del tablero del árbitro y de a quién le toca (`you`). */
  static fromBoard(board: Board, toMove: Player): Position {
    const pos = new Position();
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        const cell = board[row]?.[col] ?? 0;
        if (cell === 0) break; // se ignoran fichas "flotantes" si el tablero viniera mal
        pos.put(row, col, cell);
      }
    }
    if (toMove !== 1) {
      pos.current = toMove;
      pos.hashLo ^= SIDE_LO;
      pos.hashHi ^= SIDE_HI;
    }
    return pos;
  }

  private put(row: number, col: number, player: Player): void {
    const i = index(row, col);
    this.cells[i] = player;
    this.heights[col] = row + 1;
    this.count++;
    this.hashLo ^= ZOBRIST_LO[(player - 1) * CELLS + i]!;
    this.hashHi ^= ZOBRIST_HI[(player - 1) * CELLS + i]!;
  }

  canPlay(col: number): boolean {
    return col >= 0 && col < COLS && this.heights[col]! < ROWS;
  }

  /** Juega en `col` para el jugador al que le toca. No valida: llamar a `canPlay` antes. */
  play(col: number): void {
    this.put(this.heights[col]!, col, this.current);
    this.current = this.current === 1 ? 2 : 1;
    this.hashLo ^= SIDE_LO;
    this.hashHi ^= SIDE_HI;
  }

  /** Deshace la última ficha de `col`. */
  undo(col: number): void {
    const row = this.heights[col]! - 1;
    const i = index(row, col);
    const player = this.cells[i] as Player;
    this.cells[i] = 0;
    this.heights[col] = row;
    this.count--;
    this.current = player;
    this.hashLo ^= ZOBRIST_LO[(player - 1) * CELLS + i]! ^ SIDE_LO;
    this.hashHi ^= ZOBRIST_HI[(player - 1) * CELLS + i]! ^ SIDE_HI;
  }

  isFull(): boolean {
    return this.count === CELLS;
  }

  private at(row: number, col: number): number {
    return row >= 0 && row < ROWS && col >= 0 && col < COLS ? this.cells[index(row, col)]! : -1;
  }

  /** ¿La ficha que está arriba en `col` forma cuatro en línea? (se llama justo después de `play`). */
  lastMoveWins(col: number): boolean {
    const row = this.heights[col]! - 1;
    const player = this.at(row, col);
    for (const [dr, dc] of DIRS) {
      let n = 1;
      for (let r = row + dr, c = col + dc; this.at(r, c) === player; r += dr, c += dc) n++;
      for (let r = row - dr, c = col - dc; this.at(r, c) === player; r -= dr, c -= dc) n++;
      if (n >= CONNECT) return true;
    }
    return false;
  }

  /** ¿Jugar `col` gana de inmediato para el jugador al que le toca? */
  isWinningMove(col: number): boolean {
    if (!this.canPlay(col)) return false;
    this.play(col);
    const wins = this.lastMoveWins(col);
    this.undo(col);
    return wins;
  }

  /** Columnas donde el jugador `player` ganaría si fuera su turno. */
  winningColumnsFor(player: Player): number[] {
    const saved = this.current;
    const flip = saved !== player;
    if (flip) this.current = player;
    const cols: number[] = [];
    for (let col = 0; col < COLS; col++) if (this.isWinningMove(col)) cols.push(col);
    if (flip) this.current = saved;
    return cols;
  }
}
