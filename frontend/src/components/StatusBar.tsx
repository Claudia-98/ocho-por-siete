import type { Role } from "../game/model";
import type { Tone } from "../game/reducer";
import { Disc } from "./Disc";
import styles from "./StatusBar.module.css";

export interface StatusBarProps {
  tone: Tone;
  text: string;
  /** Explicación de la última jugada del bot (opcional). */
  detail: string | null;
  /** Aviso que no rompe la partida, p. ej. "La columna 3 está llena." */
  notice: string | null;
  onRetry: (() => void) | null;
}

const ICON: Partial<Record<Tone, Role>> = { turn: "human", won: "human", thinking: "bot", lost: "bot" };

/** Quién juega y qué pasó. Se anuncia a lectores de pantalla con aria-live. */
export function StatusBar({ tone, text, detail, notice, onRetry }: StatusBarProps) {
  const icon = ICON[tone];
  return (
    <section className={`${styles.bar} ${styles[tone]}`} aria-live="polite">
      <p className={styles.main}>
        {icon ? <Disc role={icon} size="icon" /> : null}
        <span>{text}</span>
        {tone === "thinking" ? <span className={styles.dots} aria-hidden="true" /> : null}
      </p>
      {notice ? <p className={styles.notice}>{notice}</p> : null}
      {onRetry ? (
        <button type="button" className={styles.retry} onClick={onRetry}>
          Reintentar
        </button>
      ) : null}
      {detail && !onRetry ? <p className={styles.detail}>{detail}</p> : null}
    </section>
  );
}
