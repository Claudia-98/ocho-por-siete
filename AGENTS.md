# AGENTS.md — Reglas para agentes de IA (Ocho por Siete · Equipo 4)

Este archivo lo leen Claude Code, Codex, Cursor y cualquier otro agente que trabaje en el repo. Claude Code lo carga a través de `CLAUDE.md`, que contiene `@AGENTS.md`.

## Contexto

Bot de Cuatro en línea **8 columnas × 7 filas** y su app web, para el challenge de Yompi (5 de noviembre de 2026). Los planes están en `PLAN_BACKEND.md` y `PLAN_FRONTEND.md`; el contrato del árbitro está en `docs/arbitro-openapi.json`. Lee los tres antes de proponer cambios grandes.

## Estructura

```
backend/src/rules/     reglas puras (sin I/O)
backend/src/engine/    algoritmo puro (sin I/O)
backend/src/arbiter/   cliente del árbitro (long polling)
backend/src/api/       API HTTP para la app web
backend/test/          pruebas del backend
frontend/              React + Vite
mock-arbitro/          árbitro falso basado en el OpenAPI
docs/                  TECNICO.md, MANUAL.md, IA_LOG.md, OpenAPI
```

## Comandos

| Qué | Comando |
|---|---|
| Instalar | `npm install` (en la raíz) |
| **Todas las pruebas + cobertura** | `npm test` |
| Bot contra el árbitro | `npm run bot` |
| API para la web | `npm run api` (puerto 3001) |
| App web | `npm run web` (puerto 5173) |
| Mock del árbitro | `npm run mock` (puerto 4000) |
| Revisar tipos | `npm run typecheck` |

Antes de dar una tarea por terminada: `npm run typecheck && npm test` deben pasar.

## Reglas del dominio (no las cambies)

- `board[fila][columna]`, **fila 0 = abajo**, 7 filas (0–6) × 8 columnas (0–7). Valores: `0` vacío, `1` jugador que abrió, `2` el otro.
- El centro son las columnas **3 y 4** (no hay una sola columna central).
- Victoria: 4 en línea horizontal, vertical o en cualquiera de las dos diagonales. Empate: 56 casillas llenas.
- Tiempo del árbitro: 3,000 ms. El presupuesto de búsqueda es `BUDGET_MS` (1,800 ms por defecto). Nunca lo subas sin pruebas que lo respalden.
- El bot **siempre** valida la columna contra `legal_moves` antes de enviarla.

No copies valores pensados para el tablero clásico de 7×6 (número de ventanas, columna central, tablas de aperturas).

## Convenciones de código

- TypeScript `strict`, módulos ES y sin `any` (usa `unknown` y valida).
- `rules/` y `engine/` no importan `fetch`, `fastify`, `process.env` ni `Date.now()`. El tiempo y el I/O se inyectan como parámetros.
- Funciones pequeñas con una responsabilidad; nombres en inglés para código y en español para documentación y mensajes al usuario.
- Los tipos del árbitro viven solo en `backend/src/arbiter/types.ts`. Si cambia el OpenAPI, se cambia ahí y en el mock.
- Errores HTTP con el formato `{ ok: false, error, message }`.
- Frontend: componentes de función y hooks; el estado de la partida vive en `useGame`, los componentes de presentación solo reciben props.
- El frontend no reimplementa reglas del juego: usa `legalMoves`, `status` y `winningCells` que devuelve la API.
- Logs del bot en una línea por turno, sin imprimir el token.

## Pruebas

- Toda función nueva en `rules/` o `engine/` lleva prueba. La cobertura mínima es de 70 % en esas carpetas y está configurada como umbral en Vitest: no la bajes.
- Las pruebas documentan el comportamiento, por ejemplo `"detecta diagonal ↗ que termina en la columna 7"`. No sirven las que solo comprueban que el código no lanza errores.
- El cliente del árbitro se prueba con `fetch` simulado y la API llamando directo a `handleApi()` (router puro), sin abrir puertos ni llamar a internet.
- El contrato de la API para la web está en `docs/API_WEB.md`. Si cambia una ruta o un campo, se actualiza ese archivo en el mismo commit.
- No se prueba "qué tan bien juega" con unit tests; eso se mide con partidas contra el mock.

## Qué NO tocar

- **`PLAN_BACKEND.md` y `PLAN_FRONTEND.md`:** no se editan ni se reescriben. Los cambios de rumbo se explican en `docs/TECNICO.md` → "Cambios respecto al plan".
- **Tokens y `.env`:** nunca se escriben en el código, en pruebas, en logs ni en commits. Solo existe `.env.example` sin valores.
- **`docs/arbitro-openapi.json`:** solo se reemplaza por la versión oficial del árbitro, no se edita a mano.
- **Historial de git:** nada de `push --force`, `rebase` de commits ya publicados ni reescritura de los primeros commits (el jurado revisa que los planes precedan al código).
- No agregues dependencias sin justificarlo en el mensaje del commit.

## Commits

- Conventional Commits: `feat(engine): …`, `fix(arbiter): …`, `test(rules): …`, `docs: …`.
- Commits pequeños y frecuentes; cada uno debe dejar `npm test` en verde.
- Si la IA generó la mayor parte del cambio, se indica en el cuerpo del commit.

## Registro de uso de IA

Cuando la IA proponga algo incorrecto (un bug, una suposición de 7×6, una prueba que no prueba nada), agrega una entrada en `docs/IA_LOG.md`:

```
- Fecha / quién / herramienta
- Qué se pidió
- Qué devolvió mal
- Cómo se detectó (prueba, revisión, partida)
- Cómo se corrigió
```

Este registro alimenta la exposición, que vale 15 puntos.
