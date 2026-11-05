import styles from "./Toast.module.css";

export interface ToastProps {
  /** Texto del aviso; `null` no muestra nada. */
  message: string | null;
  onClose: () => void;
}

/** Aviso breve que confirma una acción. Se anuncia a lectores de pantalla con role="status". */
export function Toast({ message, onClose }: ToastProps) {
  if (!message) return null;
  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <span>{message}</span>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar aviso">
        ×
      </button>
    </div>
  );
}
