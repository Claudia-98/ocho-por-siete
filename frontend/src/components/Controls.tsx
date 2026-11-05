import { DIFFICULTY, type Difficulty, type Role } from "../game/model";
import styles from "./Controls.module.css";

export interface ControlsProps {
  opener: Role;
  difficulty: Difficulty;
  /** Hay una partida en curso con jugadas: quién abre y la dificultad quedan bloqueados hasta que termine o se empiece otra. */
  inProgress: boolean;
  canUndo: boolean;
  busy: boolean;
  onNewGame: () => void;
  onUndo: () => void;
  onOpener: (opener: Role) => void;
  onDifficulty: (difficulty: Difficulty) => void;
}

const OPENERS: Array<{ value: Role; label: string }> = [
  { value: "human", label: "Tú" },
  { value: "bot", label: "El bot" },
];

export function Controls(props: ControlsProps) {
  const { opener, difficulty, inProgress, canUndo, busy } = props;
  return (
    <section className={styles.controls} aria-label="Opciones de la partida">
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={props.onNewGame} disabled={busy}>
          Nueva partida
        </button>
        <button type="button" onClick={props.onUndo} disabled={!canUndo || busy}>
          Deshacer jugada
        </button>
      </div>

      <fieldset className={styles.group} disabled={inProgress}>
        <legend>Quién abre</legend>
        <div className={styles.segmented}>
          {OPENERS.map((o) => (
            <label key={o.value}>
              <input type="radio" name="opener" value={o.value} checked={opener === o.value} onChange={() => props.onOpener(o.value)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.group} disabled={inProgress}>
        <legend>Dificultad</legend>
        <div className={styles.segmented}>
          {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
            <label key={d}>
              <input type="radio" name="difficulty" value={d} checked={difficulty === d} onChange={() => props.onDifficulty(d)} />
              <span>{DIFFICULTY[d].label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {inProgress ? <p className={styles.hint}>Para cambiar quién abre o la dificultad, empieza una nueva partida.</p> : null}
    </section>
  );
}
