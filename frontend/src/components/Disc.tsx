import type { CSSProperties } from "react";
import type { Role } from "../game/model";
import styles from "./Disc.module.css";

export interface DiscProps {
  role: Role;
  /** Filas que cae la ficha al aparecer (0 = sin animación). */
  fall?: number;
  highlight?: boolean;
  dimmed?: boolean;
  ghost?: boolean;
  size?: "cell" | "icon";
}

/** Ficha: la tuya es roja y lisa; la del bot es amarilla con un anillo, para distinguirlas sin depender del color. */
export function Disc({ role, fall = 0, highlight = false, dimmed = false, ghost = false, size = "cell" }: DiscProps) {
  const className = [
    styles.disc,
    role === "human" ? styles.human : styles.bot,
    size === "icon" ? styles.icon : "",
    fall > 0 ? styles.falling : "",
    highlight ? styles.highlight : "",
    dimmed ? styles.dimmed : "",
    ghost ? styles.ghost : "",
  ]
    .filter(Boolean)
    .join(" ");
  const style = fall > 0 ? ({ "--fall": fall } as CSSProperties) : undefined;
  return (
    <span
      className={className}
      style={style}
      aria-hidden="true"
      data-role={role}
      data-highlight={highlight || undefined}
      data-ghost={ghost || undefined}
    />
  );
}
