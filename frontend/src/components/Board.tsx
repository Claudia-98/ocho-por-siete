import { useRef, useState, type KeyboardEvent } from "react";
import { COLS, ROWS, type Board as BoardData, type Coord, type Player, type Role } from "../game/model";
import { roleOf } from "../game/reducer";
import { Disc } from "./Disc";
import styles from "./Board.module.css";

export interface BoardProps {
  board: BoardData;
  humanPlayer: Player;
  /** Columnas donde se puede soltar ahora (vacío = tablero bloqueado). */
  playable: number[];
  winningCells: Coord[];
  /** Última ficha colocada: es la que se anima cayendo. */
  lastMove: Coord | null;
  /** Cambia con cada jugada para que la animación se repita. */
  moveCount: number;
  onDrop: (column: number) => void;
}

const isIn = (cells: Coord[], row: number, col: number) => cells.some(([r, c]) => r === row && c === col);

/** Tablero 8×7. Cada columna es un botón; la fila 0 se dibuja abajo. */
export function Board({ board, humanPlayer, playable, winningCells, lastMove, moveCount, onDrop }: BoardProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const hasWinner = winningCells.length > 0;
  const humanRole: Role = "human";

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, col: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    buttons.current[(col + step + COLS) % COLS]?.focus();
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.markers} aria-hidden="true">
        {Array.from({ length: COLS }, (_, col) => (
          <span key={col} className={styles.marker}>
            {hovered === col && playable.includes(col) ? <Disc role={humanRole} ghost /> : null}
          </span>
        ))}
      </div>

      <div className={styles.frame} role="group" aria-label="Tablero de 8 columnas y 7 filas">
        {Array.from({ length: COLS }, (_, col) => {
          const free = ROWS - board.reduce((n, row) => n + (row[col] === 0 ? 0 : 1), 0);
          const enabled = playable.includes(col);
          const label = `Columna ${col + 1}: ${free === 0 ? "llena" : `${free} ${free === 1 ? "espacio libre" : "espacios libres"}`}`;
          return (
            <button
              key={col}
              ref={(el) => {
                buttons.current[col] = el;
              }}
              type="button"
              className={styles.column}
              aria-label={label}
              aria-disabled={!enabled}
              data-enabled={enabled}
              onClick={() => enabled && onDrop(col)}
              onKeyDown={(e) => onKeyDown(e, col)}
              onMouseEnter={() => setHovered(col)}
              onMouseLeave={() => setHovered((h) => (h === col ? null : h))}
              onFocus={() => setHovered(col)}
              onBlur={() => setHovered((h) => (h === col ? null : h))}
            >
              {Array.from({ length: ROWS }, (_, row) => {
                const cell = board[row]?.[col] ?? 0;
                const isLast = lastMove !== null && lastMove[0] === row && lastMove[1] === col;
                return (
                  <span key={row} className={styles.hole} data-cell={cell}>
                    {cell !== 0 ? (
                      <Disc
                        key={isLast ? `last-${moveCount}` : "still"}
                        role={roleOf(cell, humanPlayer)}
                        fall={isLast ? ROWS - row : 0}
                        highlight={isIn(winningCells, row, col)}
                        dimmed={hasWinner && !isIn(winningCells, row, col)}
                      />
                    ) : null}
                  </span>
                );
              })}
            </button>
          );
        })}
      </div>

      <div className={styles.numbers} aria-hidden="true">
        {Array.from({ length: COLS }, (_, col) => (
          <span key={col}>{col + 1}</span>
        ))}
      </div>
    </div>
  );
}
