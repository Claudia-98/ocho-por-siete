// Tabla de transposición de tamaño fijo (arreglos tipados, sin crear objetos durante la búsqueda).
export const Bound = {
  Exact: 1,
  Lower: 2, // el valor real es ≥ value (hubo poda beta)
  Upper: 3, // el valor real es ≤ value (ninguna jugada superó alfa)
} as const;
export type Bound = (typeof Bound)[keyof typeof Bound];

export interface TTEntry {
  depth: number;
  value: number;
  bound: Bound;
  move: number;
}

export class TranspositionTable {
  private readonly mask: number;
  private readonly keys: Int32Array;
  private readonly used: Uint8Array;
  private readonly depths: Int8Array;
  private readonly values: Int32Array;
  private readonly bounds: Int8Array;
  private readonly moves: Int8Array;

  /** `bits` = log2 del número de entradas (20 → ~1 millón, ~11 MB). */
  constructor(bits = 20) {
    const size = 1 << bits;
    this.mask = size - 1;
    this.keys = new Int32Array(size);
    this.used = new Uint8Array(size);
    this.depths = new Int8Array(size);
    this.values = new Int32Array(size);
    this.bounds = new Int8Array(size);
    this.moves = new Int8Array(size);
  }

  get(lo: number, hi: number): TTEntry | null {
    const i = lo & this.mask;
    if (!this.used[i] || this.keys[i] !== hi) return null;
    return { depth: this.depths[i]!, value: this.values[i]!, bound: this.bounds[i] as Bound, move: this.moves[i]! };
  }

  /** Reemplazo por profundidad: no se pisa una entrada más profunda de la misma posición. */
  set(lo: number, hi: number, depth: number, value: number, bound: Bound, move: number): void {
    const i = lo & this.mask;
    if (this.used[i] && this.keys[i] === hi && this.depths[i]! > depth) return;
    this.used[i] = 1;
    this.keys[i] = hi;
    this.depths[i] = depth;
    this.values[i] = value;
    this.bounds[i] = bound;
    this.moves[i] = move;
  }

  clear(): void {
    this.used.fill(0);
  }
}
