// Punto de entrada: `npm run mock` (desde la raíz). Lee variables de entorno y levanta el servidor.
import { readFileSync } from "node:fs";
import { Arbiter } from "./arbiter.js";
import { createMockServer } from "./http.js";
import type { Team } from "./types.js";

const env = process.env;
const port = Number(env.MOCK_PORT ?? 4000);

const teams: Team[] = [
  {
    id: "eq4",
    name: "Ocho por Siete",
    token: env.MOCK_TOKEN ?? "dev-eq4",
    members: [
      "Alejandro Israel Rosabal Reyes",
      "Javier Alejandro Mazariegos Godoy",
      "Lester Josué Marroquín Morales",
      "Claudia Angélica Ulin Pérez",
      "Kevin Cubas",
    ],
  },
  // Segundo equipo para amistosos locales (p. ej. dos versiones de nuestro bot).
  { id: "prueba", name: "Equipo de prueba", token: env.MOCK_TOKEN_2 ?? "dev-prueba", members: [], test: true },
];

let openapi: unknown;
try {
  openapi = JSON.parse(readFileSync(new URL("../../docs/arbitro-openapi.json", import.meta.url), "utf8"));
} catch {
  openapi = undefined;
}

const arbiter = new Arbiter({
  teams,
  deadlineMs: Number(env.MOCK_DEADLINE_MS ?? 3000),
  absentMs: Number(env.MOCK_ABSENT_MS ?? 30_000),
  houseDelayMs: Number(env.MOCK_HOUSE_DELAY_MS ?? 100),
  log: (line) => console.log(`[mock] ${new Date().toISOString().slice(11, 23)} ${line}`),
});

createMockServer(arbiter, { openapi }).listen(port, () => {
  console.log(`Mock del árbitro en http://localhost:${port}`);
  console.log(`Equipos: ${teams.map((t) => `${t.id} (token "${t.token}")`).join(", ")}`);
  console.log(`Crear práctica: curl -X POST localhost:${port}/api/practice -H "Authorization: Bearer ${teams[0]!.token}" -H "Content-Type: application/json" -d '{"opponent":"casa-basico","first":1}'`);
});
