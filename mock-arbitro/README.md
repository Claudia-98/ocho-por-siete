# Mock del árbitro

Árbitro falso que implementa `docs/arbitro-openapi.json` (v1.0.1) para desarrollar y probar el bot sin el árbitro real.

## Levantarlo

Desde la raíz del repo:

```bash
npm run mock
```

Queda en `http://localhost:4000`. En el `.env` del bot:

```
ARBITRO_URL=http://localhost:4000
TEAM_TOKEN=dev-eq4
```

## Equipos y tokens del mock

| Equipo | `team_id` | Token | Variable para cambiarlo |
|---|---|---|---|
| Ocho por Siete | `eq4` | `dev-eq4` | `MOCK_TOKEN` |
| Equipo de prueba (no compite, `standing: null`) | `prueba` | `dev-prueba` | `MOCK_TOKEN_2` |

## Probar a mano

```bash
# ¿Está arriba?
curl localhost:4000/api/health

# Crear práctica contra casa-basico, abre el equipo
curl -X POST localhost:4000/api/practice \
  -H "Authorization: Bearer dev-eq4" -H "Content-Type: application/json" \
  -d '{"opponent":"casa-basico","first":1}'

# Pedir el turno (long polling, máximo 20 s)
curl "localhost:4000/api/next?wait=20" -H "Authorization: Bearer dev-eq4"

# Jugar la columna 3
curl -X POST localhost:4000/api/move \
  -H "Authorization: Bearer dev-eq4" -H "Content-Type: application/json" \
  -d '{"game_id":"g_p_01","column":3}'

# Ver la partida
curl localhost:4000/api/games/g_p_01
```

## Qué implementa

| Ruta | Comportamiento |
|---|---|
| `GET /api/next?wait=N` | Long polling real (máx. 25 s). Devuelve el turno más antiguo. Si el bot cierra la conexión, el turno **no** se marca como entregado. |
| `POST /api/move` | `deadline_ms` = 3,000 desde `served_at`. `400 illegal_move` / `400 timeout` → pierde. `400 validation` (JSON inválido o sin `game_id`), `409 not_your_turn`, `409 unknown_game` → no penaliza. |
| `POST /api/practice` | `casa-aleatorio` (azar) y `casa-basico` (gana y bloquea cuatros inmediatos). `first`: 1 abre el equipo, 2 la casa. |
| `GET /api/me`, `PUT /api/me/submission` | Turnos pendientes, entrega (valida URL de GitHub/Bitbucket y hash). |
| `GET /api/games`, `GET /api/games/{id}` | Lista sin tablero (con `team_id` y `house`), detalle con tablero. |
| `GET /api/standings`, `/api/health`, `/api/openapi.json` | Públicas. |

Además, si no se recoge un turno en 30 s, la partida se pierde por ausencia (`absent`).

**No implementa:** `/api/state` y `/api/live` (SSE del tablero en vivo), liga ni playoffs.

## Rutas que solo existen en el mock

| Ruta | Para qué |
|---|---|
| `POST /mock/friendly` `{"team1":"eq4","team2":"prueba"}` | Amistoso entre dos bots locales (dos versiones del nuestro, o el mismo contra sí mismo con `team2: "eq4"`). |
| `POST /mock/phase` `{"phase":"frozen"}` | Simular el congelamiento (prácticas y entregas cerradas, `423`). |

## Variables de entorno

| Variable | Por defecto | Para qué |
|---|---|---|
| `MOCK_PORT` | `4000` | Puerto |
| `MOCK_DEADLINE_MS` | `3000` | Tiempo por jugada |
| `MOCK_ABSENT_MS` | `30000` | Tiempo para recoger el turno antes de perder por ausencia |
| `MOCK_HOUSE_DELAY_MS` | `100` | Cuánto tarda en jugar el bot de la casa |

## Pruebas

`npm test` desde la raíz incluye las del mock (`mock-arbitro/test/`). El núcleo (`src/arbiter.ts`) recibe un reloj falso, así que las pruebas de tiempos (timeout, ausencia, long polling) no esperan de verdad.
