// Entrada `npm run api`: API para la app web en el puerto PORT (3001 por defecto).
// Es un proceso separado del bot del torneo: una búsqueda de la web nunca retrasa un turno del torneo.
import { performance } from "node:perf_hooks";
import { createApiServer } from "./api/server.js";
import { loadDotEnv } from "./config.js";

loadDotEnv();
const port = Number(process.env.PORT ?? 3001);
const arbiterUrl = process.env.ARBITRO_URL?.trim() || undefined;
const log = (line: string) => console.log(`${new Date().toISOString().slice(11, 23)} ${line}`);

createApiServer({ now: () => performance.now(), ...(arbiterUrl ? { arbiterUrl } : {}) }, log).listen(port, "0.0.0.0", () => {
  log(`API para la web en http://localhost:${port}/api/v1 (también accesible desde la red local)`);
  log(arbiterUrl ? `Replay de partidas del torneo desde ${arbiterUrl}` : "Sin ARBITRO_URL: el replay de partidas del torneo está desactivado");
});
