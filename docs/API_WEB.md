# API para la app web

Contrato entre `frontend/` y `backend/src/api/`. Base: `http://localhost:3001/api/v1` (en desarrollo, el proxy de Vite manda `/api` ahí).

Levantar: `npm run api` (puerto `PORT`, 3001 por defecto). Es un proceso separado del bot del torneo y usa **el mismo algoritmo** (`chooseMove`).

**Sin estado:** el frontend guarda la lista `moves` (columnas jugadas desde el inicio; el jugador 1 abre) y la manda en cada petición. El backend reconstruye el tablero, valida y devuelve todo lo que hay que dibujar. El frontend **no** calcula reglas.

## Estado de la partida (`State`)

Lo devuelven `/state`, `/play` y `/bot-move` (dentro de `state`):

```json
{
  "moves": [3, 4, 3],
  "board": [[0,0,0,1,2,0,0,0], [0,0,0,1,0,0,0,0], [0,0,0,0,0,0,0,0], "… 7 filas, fila 0 = abajo"],
  "status": "playing",
  "nextPlayer": 2,
  "winner": null,
  "winningCells": [],
  "legalMoves": [0, 1, 2, 3, 4, 5, 6, 7]
}
```

| Campo | Significado |
|---|---|
| `board[fila][columna]` | 0 vacío, 1 jugador que abrió, 2 el otro. **Fila 0 = abajo**: al dibujar, la fila 6 va arriba. |
| `status` | `"playing"`, `"won"` o `"draw"` |
| `nextPlayer` | 1 o 2; `null` si terminó |
| `winner` | 1 o 2; `null` si sigue o es empate |
| `winningCells` | `[[fila, columna], …]` para resaltar la línea ganadora |
| `legalMoves` | Columnas donde se puede jugar (las demás, deshabilitadas) |

Quién es el humano y quién el bot lo decide el frontend: si abre el humano, el humano es 1; si abre el bot, el bot es 1.

## Rutas

| Método | Ruta | Cuerpo | Respuesta 200 |
|---|---|---|---|
| GET | `/health` | — | `{ "ok": true }` |
| POST | `/state` | `{ "moves": [] }` | `State` |
| POST | `/play` | `{ "moves": [...], "column": 4 }` | `State` con la jugada aplicada |
| POST | `/bot-move` | `{ "moves": [...], "budgetMs"?: 1000, "maxDepth"?: 4 }` | `{ "column": 3, "state": State, "stats": { depth, nodes, ms, score, reason } }` |
| GET | `/games?kind=league&limit=20` | — | Lista de partidas del árbitro (sin tablero) |
| GET | `/replay/{game_id}` | — | Partida del árbitro con `moves` y `result` |

- `budgetMs`: tiempo de pensar del bot (50 a 2500, por defecto 1000).
- `maxDepth`: límite de profundidad (1 a 42). Sirve para niveles de dificultad, por ejemplo: fácil `maxDepth: 2`, normal `maxDepth: 6`, difícil sin límite y `budgetMs: 1500`.
- `/games` y `/replay` reenvían al árbitro público (`ARBITRO_URL`) para evitar CORS. Sin `ARBITRO_URL` responden `503`.

## Errores

Siempre `{ "ok": false, "error": "<código>", "message": "<texto para mostrar>" }`:

| HTTP | `error` | Cuándo | Qué mostrar |
|---|---|---|---|
| 400 | `illegal_move` | `/play` en columna llena o inexistente | El `message` ("La columna 0 está llena."); la partida sigue |
| 400 | `game_over` | `/play` o `/bot-move` con la partida terminada | Ofrecer "Nueva partida" |
| 400 | `validation` | `moves` inválido, JSON roto, parámetros raros | Error de la app (no debería pasar) |
| 404 | `not_found` | Ruta inexistente | — |
| 502 / 503 | `arbiter_*` | Replay sin árbitro o árbitro caído | "No se pudo cargar la partida del torneo" |

## Flujo típico

1. Nueva partida: `POST /state { moves: [] }`. Si abre el bot, encadenar `POST /bot-move { moves: [] }`.
2. Clic del humano en la columna `c`: `POST /play { moves, column: c }` → dibujar.
3. Si `status === "playing"`: `POST /bot-move { moves }` → animar `column` → dibujar `state`. Mientras tanto, mostrar "pensando…" y bloquear el tablero.
4. Si `status` es `won` o `draw`: mostrar el resultado y resaltar `winningCells`.

## Probar con curl

```bash
curl -X POST localhost:3001/api/v1/state -H "Content-Type: application/json" -d '{"moves":[]}'
curl -X POST localhost:3001/api/v1/play -H "Content-Type: application/json" -d '{"moves":[],"column":3}'
curl -X POST localhost:3001/api/v1/bot-move -H "Content-Type: application/json" -d '{"moves":[3],"budgetMs":500}'
```
