// Entrada `npm run bot`: conecta el algoritmo al árbitro y juega hasta Ctrl+C.
//   npm run bot                                  → solo juega los turnos que le asigne el árbitro
//   npm run bot -- --practice casa-basico        → además crea una práctica al arrancar
//   npm run bot -- --practice casa-basico --first 2 --games 5
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import { ArbiterClient, AuthError } from "./arbiter/client.js";
import { runLoop } from "./arbiter/loop.js";
import { loadDotEnv, readBotConfig } from "./config.js";
import { chooseMove } from "./engine/index.js";

const { values } = parseArgs({
  options: {
    practice: { type: "string" },
    first: { type: "string", default: "1" },
    games: { type: "string", default: "1" },
  },
});

loadDotEnv();
let config: ReturnType<typeof readBotConfig>;
try {
  config = readBotConfig();
} catch (err) {
  console.error(`ERROR: ${(err as Error).message}`);
  process.exit(1);
}
const now = () => performance.now();
const log = (line: string) => console.log(`${new Date().toISOString().slice(11, 23)} ${line}`);
const client = new ArbiterClient({ baseUrl: config.arbiterUrl, token: config.token });

let stopping = false;
process.on("SIGINT", () => {
  if (stopping) process.exit(1);
  stopping = true;
  log("Deteniendo al terminar la consulta actual (Ctrl+C otra vez para salir ya)…");
});

async function main(): Promise<void> {
  log(`Bot Ocho por Siete → ${config.arbiterUrl} · presupuesto ${config.budgetMs} ms por jugada`);
  try {
    const me = (await client.me()) as { team?: { name?: string }; phase?: string };
    log(`Conectado como "${me.team?.name ?? "?"}" · fase ${me.phase ?? "?"}`);
  } catch (err) {
    if (err instanceof AuthError) throw err;
    // Árbitro caído o red inestable: no salir; el ciclo reintenta hasta que responda.
    log(`Aviso: no se pudo consultar /api/me (${String(err)}). Se sigue intentando…`);
  }

  if (values.practice === "casa-basico" || values.practice === "casa-aleatorio") {
    const first = values.first === "2" ? 2 : 1;
    for (let i = 0; i < Number(values.games); i++) {
      const p = await client.practice(values.practice, first);
      log(`Práctica creada: ${p.game_id} contra ${values.practice} (abre ${first === 1 ? "nuestro bot" : "la casa"})`);
    }
  } else if (values.practice) {
    throw new Error(`--practice debe ser casa-basico o casa-aleatorio, no "${values.practice}".`);
  }

  await runLoop({
    client,
    decide: (turn) => chooseMove(turn.board, turn.you, turn.legal_moves, { budgetMs: config.budgetMs, now }),
    log,
    now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    shouldStop: () => stopping,
  });
  log("Bot detenido.");
}

main().catch((err: unknown) => {
  log(err instanceof AuthError ? `ERROR: ${err.message}` : `ERROR: ${String(err)}`);
  process.exit(1);
});
