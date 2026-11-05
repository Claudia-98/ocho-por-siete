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

/** Etiqueta corta sobre el mensaje: dice de un vistazo en qué momento de la partida estás. */
const LABEL: Record<Tone, string> = {
  idle: "Nueva partida",
  turn: "Tu turno",
  thinking: "Turno del bot",
  won: "Partida terminada",
  lost: "Partida terminada",
  draw: "Partida terminada",
  error: "Algo salió mal",
};

/** Línea de apoyo bajo el mensaje. En tu turno y en el del bot siempre ocupa su lugar, para que el panel no brinque. */
function supportLine(tone: Tone, detail: string | null): string | null {
  // La explicación es de la última jugada del bot: solo tiene sentido cuando ya te toca.
  if (tone === "turn") return detail ?? "Haz clic en una columna para soltar tu ficha.";
  if (tone === "thinking") return "Buscando la mejor jugada";
  return null;
}

/** Quién juega y qué pasó. Se anuncia a lectores de pantalla con aria-live. */
export function StatusBar({ tone, text, detail, notice, onRetry }: StatusBarProps) {
  const icon = ICON[tone];
  const support = supportLine(tone, detail);
  return (
    <section className={`${styles.card} ${styles[tone]}`} aria-live="polite">
      <div className={styles.head}>
        <span className={styles.badge} aria-hidden="true">
          {icon ? <Disc role={icon} size="icon" /> : <span className={styles.mark}>{tone === "error" ? "!" : "•"}</span>}
        </span>
        <div className={styles.copy}>
          <p className={styles.label}>{LABEL[tone]}</p>
          <p className={styles.main}>{text}</p>
        </div>
      </div>
      {support ? (
        <p className={styles.detail}>
          {support}
          {tone === "thinking" ? <span className={styles.dots} aria-hidden="true" /> : null}
        </p>
      ) : null}
      {notice ? <p className={styles.notice}>{notice}</p> : null}
      {onRetry ? (
        <button type="button" className={styles.retry} onClick={onRetry}>
          Reintentar
        </button>
      ) : null}
    </section>
  );
}
