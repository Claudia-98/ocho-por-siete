# PLAN_BACKEND.md — Bot Cuatro en línea 8×7 (Ocho por Siete · Equipo 4)

> Plan escrito **antes de la primera línea de código**. Las desviaciones que surjan durante el desarrollo se documentan en `docs/TECNICO.md` (sección "Cambios respecto al plan"); este archivo no se reescribe.

## 1. Alcance

**Incluye**
- Motor del juego (reglas): tablero 8 columnas × 7 filas, caída de fichas, jugadas legales, detección de victoria (4 direcciones) y empate.
- Algoritmo de decisión: negamax con poda alfa-beta, iterative deepening y control de tiempo.
- Cliente del árbitro: ciclo de long polling (`GET /api/next`) y envío de jugada (`POST /api/move`), según `arbitro-openapi.json` v0.9.0.
- API HTTP para la aplicación web, que usa **el mismo motor y el mismo algoritmo** que el bot del torneo.
- Mock del árbitro para desarrollar y probar antes del jueves.
- Pruebas automatizadas con cobertura, ejecutables con un solo comando (`npm test`).

**No incluye**
- Persistencia (base de datos). La app web es sin estado del lado del servidor.
- Despliegue en la nube: el bot corre en la laptop del equipo (es cliente, no necesita URL pública).
- Aperturas precalculadas o solver perfecto.

## 2. Stack

| Pieza | Elección | Por qué |
|---|---|---|
| Lenguaje | TypeScript (modo `strict`) sobre Node.js 22 LTS o superior (Node 20 ya no tiene soporte) | Un solo lenguaje en bot, API, mock y frontend; tipos compartidos; `fetch` nativo; el cliente de referencia de las bases es Node. |
| Servidor HTTP (API web y mock) | Fastify | `app.inject()` permite probar rutas sin abrir puertos. |
| Pruebas | Vitest + `@vitest/coverage-v8` | Rápido, nativo para TS, cobertura integrada con umbrales. |
| Monorepo | npm workspaces | `npm test` en la raíz corre todo. |

## 3. Arquitectura y módulos

```
backend/
  src/
    rules/        Reglas puras, sin I/O
      board.ts        tipo Board, crear, clonar, aplicar jugada, altura por columna
      rules.ts        legalMoves, isWin, winningCells, isDraw, estado de la partida
    engine/       Algoritmo puro, sin I/O
      evaluate.ts     heurística
      search.ts       negamax + alfa-beta + iterative deepening
      tt.ts           tabla de transposición
      chooseMove.ts   punto de entrada: (board, player, legalMoves, budgetMs) => { column, stats }
    arbiter/      Cliente del árbitro
      client.ts       llamadas HTTP (fetch inyectable para pruebas)
      loop.ts         ciclo next → decidir → move, reintentos y logs
      types.ts        tipos derivados del OpenAPI
    api/          API para la app web
      server.ts       Fastify, rutas /api/v1/*
    config.ts     variables de entorno (ARBITRO_URL, TEAM_TOKEN, BUDGET_MS, PORT)
    bot.ts        entrada `npm run bot`
    web-api.ts    entrada `npm run api`
  test/           pruebas por módulo
mock-arbitro/     servidor falso que implementa el OpenAPI con bots de la casa
```

**Regla de dependencias:** `rules` no depende de nada; `engine` depende solo de `rules`; `arbiter` y `api` dependen de `engine` y `rules`. Ningún archivo de `rules/` o `engine/` importa HTTP, `process.env` ni el reloj del sistema directamente (el tiempo se inyecta). Así el algoritmo se prueba sin levantar servidores.

El bot y la API web son **dos procesos** que comparten el mismo código (`npm run bot` y `npm run api`). Así una búsqueda de 2 s de la app web nunca retrasa un turno del torneo.

## 4. Representación del tablero

- Igual que el árbitro: `board[fila][columna]`, fila 0 abajo, valores `0 | 1 | 2`.
- Internamente, el motor puede usar un arreglo plano `Int8Array(56)` + `heights[8]` para que aplicar y deshacer una jugada cueste O(1). La conversión desde y hacia el formato del árbitro vive en `board.ts` y tiene pruebas.
- Mejora opcional, solo si sobra tiempo y las mediciones lo justifican: bitboards. Con 7 filas + 1 centinela por columna son 64 bits, lo que en JS obliga a `BigInt` o a partir el tablero en dos enteros de 32 bits. No es parte del alcance base.

## 5. Algoritmo elegido y por qué

**Negamax con poda alfa-beta + iterative deepening + tabla de transposición + heurística por ventanas.**

Por qué este y no Monte Carlo (MCTS):
- Cuatro en línea es determinista, de información perfecta y con factor de ramificación bajo (≤ 8): es el caso clásico de minimax.
- Iterative deepening da un "anytime algorithm": siempre hay una jugada lista de la última profundidad completada, lo que encaja con el límite de 3,000 ms.
- Es fácil de explicar en la exposición (15 pts) y de probar de forma determinista.

Componentes:
1. **Atajos antes de buscar:** si hay una jugada que gana ya, jugarla. Si el rival gana en la siguiente en una columna, bloquearla. Si solo hay una jugada legal, devolverla sin buscar.
2. **Orden de jugadas:** del centro hacia afuera `[3, 4, 2, 5, 1, 6, 0, 7]` (8 columnas: el centro son la 3 y la 4), y primero la mejor jugada de la iteración anterior o de la TT. Un buen orden multiplica la poda.
3. **Heurística (`evaluate.ts`):** se recorren todas las ventanas de 4 casillas (horizontales 5×7 = 35, verticales 8×4 = 32, diagonales 2×5×4 = 40; 107 en total) y se puntúa según cuántas fichas propias y vacías tiene cada una:
   - 3 propias + 1 vacía: +50 · 2 propias + 2 vacías: +10
   - 3 del rival + 1 vacía: −60 (se penaliza un poco más defender que atacar)
   - bonificación por fichas en las columnas centrales 3 y 4
   - victoria: `±(10000 − profundidad)` para preferir ganar rápido y perder tarde.
   Los pesos se ajustan con partidas bot contra bot en el mock; el ajuste queda documentado en `docs/TECNICO.md`.
4. **Tabla de transposición:** hash Zobrist (32 bits) → `{profundidad, valor, tipo de cota, mejor jugada}`. Tamaño acotado para no agotar memoria.
5. **Mejora opcional:** paridad de amenazas (casillas impares y pares según quién abrió).

Fuente base: técnicas descritas por Pascal Pons, "Solving Connect 4: how to build a perfect AI" (blog.gamesolver.org), adaptadas a 8×7 y a búsqueda con límite de tiempo. Se cita también en `docs/TECNICO.md`.

## 6. Manejo del tiempo

- Límite del árbitro: 3,000 ms desde `served_at`. **Presupuesto de búsqueda: 1,800 ms** (configurable con `BUDGET_MS`), medido con `performance.now()` desde que llega la respuesta de `/api/next`.
- No se calcula el tiempo restante con `served_at` contra el reloj local, porque la diferencia entre relojes podría hacer creer que no hay tiempo. `served_at` solo se registra en los logs.
- La búsqueda revisa el reloj cada 1,024 nodos. Si se acaba el tiempo, aborta la profundidad en curso y devuelve la mejor jugada de la última profundidad completa.
- **Red de seguridad:** antes de enviar, se verifica que la columna esté en `legal_moves`. Si no lo está, o si el algoritmo lanza una excepción, se envía la primera jugada legal en orden de centro.

## 7. Cliente del árbitro

Ciclo (`loop.ts`):
1. `GET /api/next?wait=20` con `Authorization: Bearer $TEAM_TOKEN`.
2. `status: idle` → volver a llamar de inmediato.
3. `status: turn` → `chooseMove(board, you, legal_moves, BUDGET_MS)` → `POST /api/move {game_id, column}`.
4. Respuestas: `200 playing|won|draw` → log y continuar; `409 not_your_turn` → ignorar (no penaliza); `400 illegal_move|timeout` → log de error con el tablero completo para diagnosticar; `401` → detenerse con un mensaje claro ("revisa TEAM_TOKEN").
5. Cualquier otro error del árbitro (`unknown_game`, `validation`, `423 practice_closed`, `5xx` o una respuesta que no se puede interpretar) se registra en el log con el código y el mensaje, y el ciclo continúa. El bot nunca se detiene por un error que no sea `401`.
6. Errores de red: espera exponencial de 0.5 s a 4 s como máximo. Nunca superar 30 s sin recoger turno (derrota por ausencia).
7. Logs de una línea por turno: `game_id, turn, you, column, depth, nodes, ms, score`. Sirven para la exposición y para el reporte técnico.

`client.ts` recibe `fetch` y `baseUrl` por parámetro para probarlo contra respuestas simuladas.

## 8. API para la app web

Sin estado: el frontend manda la lista de jugadas y el backend reconstruye el tablero. El backend es la única autoridad sobre las reglas; el frontend no las duplica.

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/api/v1/health` | — | `{ ok: true }` |
| POST | `/api/v1/state` | `{ moves: number[] }` | `{ board, nextPlayer, legalMoves, status: "playing"\|"won"\|"draw", winner, winningCells }` |
| POST | `/api/v1/play` | `{ moves: number[], column: number }` | igual que `/state` con la jugada humana aplicada, o `400 { error: "illegal_move" }` |
| POST | `/api/v1/bot-move` | `{ moves: number[], budgetMs?: number }` | `{ column, state, stats: { depth, nodes, ms, score } }` |
| GET | `/api/v1/replay/:gameId` (opcional) | — | proxy a `GET /api/games/{id}` del árbitro, para evitar CORS |

Errores con el mismo formato que el árbitro: `{ ok: false, error, message }`. CORS habilitado para la red local.

## 9. Mock del árbitro

Servidor Fastify en `mock-arbitro/` que implementa el OpenAPI:
- `/api/next` con long polling real (retiene la conexión hasta `wait`), `/api/move` con validación, `deadline_ms` y los códigos 400/409, `/api/practice` con `casa-aleatorio` y `casa-basico` (gana y bloquea cuatros inmediatos, igual que el árbitro real), `/api/me`, `/api/games/:id`.
- Tokens falsos desde `.env` y un modo para correr N partidas seguidas y reportar el marcador (para ajustar la heurística).

## 10. Pasos en orden y criterio de listo

| # | Paso | Listo cuando |
|---|---|---|
| 1 | Planes y `AGENTS.md` en el repo (primeros commits) | Commits visibles en el historial antes de cualquier código |
| 2 | Andamiaje: workspaces, TS, Vitest, `npm test` con cobertura | `npm test` corre y reporta cobertura con 0 pruebas fallando |
| 3 | `rules/` + pruebas | Pruebas de caída, legales, 4 direcciones de victoria, empate en verde |
| 4 | `engine/` v1: alfa-beta a profundidad fija + heurística | Gana siempre a `casa-aleatorio` en 20 partidas en el mock |
| 5 | Iterative deepening + control de tiempo + red de seguridad | Pruebas: nunca ilegal, < `BUDGET_MS` + 100 ms, tableros límite |
| 6 | Mock del árbitro | El bot de referencia de las bases juega una partida completa contra el mock |
| 7 | `arbiter/` cliente + loop + pruebas con fetch simulado | Bot juega 10 partidas seguidas contra el mock sin errores |
| 8 | `api/` para la web + pruebas con `inject` | El frontend juega una partida completa |
| 9 | TT + orden de jugadas + ajuste de pesos | Gana ≥ 90 % a `casa-basico` en el mock; profundidad media documentada |
| 10 | **Jueves 8:00:** adaptar al OpenAPI definitivo, conectar al árbitro real, práctica contra la casa | Partida de práctica completa en el tablero en vivo |
| 11 | `docs/TECNICO.md` con arquitectura final, desviaciones y cobertura | Revisado por otro miembro del equipo |
| 12 | **Antes de 9:45:** `PUT /api/me/submission` con repo y hash | `GET /api/me` muestra la entrega registrada |

Objetivo: llegar al jueves con los pasos 1–9 hechos.

## 11. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Timeout → derrota | Presupuesto de 1,800 ms, abortar por nodos, red de seguridad, prueba automática del presupuesto |
| Jugada ilegal → derrota | Validar contra `legal_moves` antes de enviar; prueba de "nunca ilegal" con tableros aleatorios |
| La laptop se suspende o se cae el Wi-Fi → derrota por ausencia | Laptop conectada a corriente, sin suspensión; reintentos; una segunda laptop lista con el bot clonado |
| El OpenAPI definitivo cambia | Tipos y parseo aislados en `arbiter/types.ts` y `client.ts`; pruebas del cliente detectan el cambio |
| Confusión fila/columna o jugador 1/2 | Conversión en un solo lugar, con pruebas usando el ejemplo exacto del OpenAPI |
| Bug de la IA en la búsqueda (signo de negamax, poda mal hecha) | Pruebas de "gana en 1", "bloquea en 1", "gana en 2"; comparar alfa-beta contra minimax sin poda a profundidad baja |
| Token filtrado | Solo en `.env`, que está en `.gitignore`; `.env.example` sin valores |
| Dos procesos usando el mismo token | Solo el proceso `bot` habla con el árbitro; la API web nunca usa el token salvo en el proxy público de replay, que no lo necesita |

## 12. Cómo se valida

- **Unitarias:** reglas, heurística, búsqueda (posiciones tácticas conocidas), cliente con `fetch` simulado, rutas con `inject`.
- **Integración:** bot contra mock del árbitro, partidas completas.
- **Fuerza:** torneos locales contra `casa-aleatorio`, `casa-basico` y contra versiones anteriores del propio bot.
- **Cobertura:** umbral de 70 % en `rules/` y `engine/` configurado en Vitest; si se baja del umbral, `npm test` falla.

## 13. Qué se delega a la IA y cómo se verifica

| Se delega | Lo verifica una persona así |
|---|---|
| Andamiaje (configs, scripts, workspaces) | `npm test` y `npm run bot` funcionan desde un clon limpio |
| Primer borrador de `rules/` y sus pruebas | Revisión de las pruebas de borde: las 4 diagonales en los extremos del tablero 8×7 y no en 7×6 |
| Búsqueda alfa-beta y TT | Pruebas tácticas + comparación contra minimax sin poda; alguien del equipo debe poder explicarla línea por línea |
| Mock del árbitro a partir del OpenAPI | Se contrasta con los ejemplos del OpenAPI y de las bases |
| Redacción inicial de documentación | Lectura completa por un miembro que no la escribió |

**No se delega sin revisión:** pesos de la heurística (se deciden con datos de partidas), decisiones de tiempo y seguridad, y el registro de la entrega.

Cada uso relevante de la IA (qué se pidió, qué devolvió mal, cómo se detectó) se anota en `docs/IA_LOG.md`. Es material directo para la exposición.

## 14. Reparto inicial (propuesta)

| Rol | Responsable |
|---|---|
| Reglas + pruebas | _por asignar_ |
| Algoritmo (búsqueda, heurística, tiempo) | _por asignar_ (2 personas) |
| Cliente del árbitro + mock | _por asignar_ |
| Frontend | _por asignar_ (ver PLAN_FRONTEND.md) |
| `docs/TECNICO.md` (arquitectura final, algoritmo, desviaciones, cobertura) | _por asignar_ |
| `docs/MANUAL.md` (manual para usuario final, con capturas) | _por asignar_ |
| `README.md` (instalación, comandos, variables de entorno) | _por asignar_ |

Todos repasan el algoritmo antes de la exposición: el jurado puede preguntarle a cualquiera.
