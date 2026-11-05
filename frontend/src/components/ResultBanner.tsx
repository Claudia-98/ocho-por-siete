import type { Role } from "../game/model";
import { Disc } from "./Disc";
import styles from "./ResultBanner.module.css";

export interface ResultBannerProps {
  /** Quién ganó; null = empate. */
  winner: Role | null;
  moves: number;
  onPlayAgain: () => void;
}

export function ResultBanner({ winner, moves, onPlayAgain }: ResultBannerProps) {
  const title = winner === "human" ? "¡Ganaste!" : winner === "bot" ? "Ganó el bot" : "Empate";
  const detail =
    winner === null
      ? `Se llenaron las 56 casillas sin cuatro en línea.`
      : `${winner === "human" ? "Hiciste" : "Hizo"} cuatro en línea en la jugada ${moves}. La línea quedó marcada en el tablero.`;
  return (
    <section className={`${styles.banner} ${winner ? styles[winner] : styles.draw}`} aria-live="assertive">
      <h2 className={styles.title}>
        {winner ? <Disc role={winner} size="icon" /> : null}
        {title}
      </h2>
      <p className={styles.detail}>{detail}</p>
      <button type="button" className={styles.again} onClick={onPlayAgain} autoFocus>
        Jugar otra vez
      </button>
    </section>
  );
}
