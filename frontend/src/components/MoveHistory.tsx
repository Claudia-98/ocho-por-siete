import type { HistoryEntry } from "../game/reducer";
import { Disc } from "./Disc";
import styles from "./MoveHistory.module.css";

/** Lista de jugadas, plegable para no distraer. */
export function MoveHistory({ entries }: { entries: HistoryEntry[] }) {
  return (
    <details className={styles.history}>
      <summary>Jugadas de esta partida ({entries.length})</summary>
      {entries.length === 0 ? (
        <p className={styles.empty}>Todavía no hay jugadas.</p>
      ) : (
        <ol className={styles.list}>
          {entries.map((e) => (
            <li key={e.turn}>
              <Disc role={e.role} size="icon" />
              <span>
                {e.role === "human" ? "Tú" : "Bot"}, columna {e.column}
              </span>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
