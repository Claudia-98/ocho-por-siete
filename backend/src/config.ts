// Variables de entorno. Solo los puntos de entrada (bot.ts, web-api.ts) leen process.env.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface BotConfig {
  arbiterUrl: string;
  token: string;
  budgetMs: number;
}

/** Carga el .env de la raíz del repo si existe (Node ≥ 21.7 trae process.loadEnvFile). */
export function loadDotEnv(): void {
  const path = fileURLToPath(new URL("../../.env", import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}

export function readBotConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  const arbiterUrl = env.ARBITRO_URL?.trim();
  const token = env.TEAM_TOKEN?.trim();
  const budgetMs = Number(env.BUDGET_MS ?? 1800);
  const missing = [!arbiterUrl && "ARBITRO_URL", !token && "TEAM_TOKEN"].filter(Boolean);
  if (missing.length) {
    throw new Error(`Faltan variables de entorno: ${missing.join(", ")}. Copia .env.example a .env y complétalo.`);
  }
  if (!Number.isFinite(budgetMs) || budgetMs < 50 || budgetMs > 2500) {
    throw new Error(`BUDGET_MS=${env.BUDGET_MS} no es válido: debe estar entre 50 y 2500 (el árbitro da 3000).`);
  }
  return { arbiterUrl: arbiterUrl!, token: token!, budgetMs };
}
