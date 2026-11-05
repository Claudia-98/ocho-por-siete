import { COLS, ROWS, type Board, type Cell } from "../src/rules/index.js";

/**
 * Construye un tablero a partir de un dibujo, **con la fila de arriba primero**
 * (como se ve en pantalla). `.` vacío, `X` jugador 1, `O` jugador 2.
 * Se pueden omitir filas de arriba: las que falten se rellenan vacías.
 *
 *   picture([
 *     "...O....",
 *     "..XXX...",   // ← fila 0 (abajo)
 *   ])
 */
export function picture(lines: string[]): Board {
  if (lines.length > ROWS) throw new Error(`El dibujo tiene ${lines.length} filas; máximo ${ROWS}.`);
  const padded = [...Array<string>(ROWS - lines.length).fill(".".repeat(COLS)), ...lines];
  return padded
    .map((line) => {
      if (line.length !== COLS) throw new Error(`Fila "${line}" no tiene ${COLS} columnas.`);
      return [...line].map((ch): Cell => (ch === "X" ? 1 : ch === "O" ? 2 : 0));
    })
    .reverse(); // board[0] es la fila de abajo
}

/** Tablero lleno sin ningún cuatro en línea (28 fichas de cada jugador). */
export function fullDrawBoard(): Board {
  return Array.from({ length: ROWS }, (_, row) =>
    Array.from({ length: COLS }, (_, col): Cell => ((Math.floor(col / 2) + row) % 2 === 0 ? 2 : 1)),
  );
}
