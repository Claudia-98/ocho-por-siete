# Documentación técnica

Bot de Cuatro en línea 8×7 y su app web, Equipo 4 (Ocho por Siete). Para un recorrido de 10 minutos: lee "Arquitectura" y luego las secciones del algoritmo y del cliente del árbitro.

## Arquitectura

```
                         ┌──────────────── backend/src ────────────────┐
  Árbitro (HTTPS)  ◄──── │ arbiter/ (cliente, long polling)  ── bot.ts │  npm run bot
                         │        │                                    │
                         │        ▼                                    │
                         │ engine/ (alfa-beta) ◄── rules/ (reglas)     │  sin I/O, probados
                         │        ▲                                    │
  App web (React)  ────► │ api/ (router HTTP) ─────────── web-api.ts   │  npm run api
   frontend/             └─────────────────────────────────────────────┘
  mock-arbitro/  ← mismo contrato que el árbitro real (npm run mock)
```

- `rules/` y `engine/` no saben nada de HTTP, variables de entorno ni del reloj del sistema: todo se inyecta. Por eso se prueban sin levantar servidores.
- El bot del torneo y la API para la web son **procesos separados** que usan el **mismo** `chooseMove`.
- `npm run submit` registra la entrega (`backend/src/submit.ts`, lógica pura en `submission.ts`).

## Pruebas y cobertura

Un solo comando: `npm test` (Vitest en los tres paquetes). Al 4 de noviembre:

| Paquete | Pruebas | Cobertura |
|---|---|---|
| backend (reglas, algoritmo, cliente, API, entrega) | 149 | reglas + algoritmo: **99.5 %** de líneas (umbral exigido: 70 %, configurado en Vitest) |
| mock-arbitro | 33 | núcleo del árbitro falso ~99 % |
| frontend | 56 | ~87 % de líneas; `useGame` se verificó jugando en el navegador |
| **Total** | **238** | |

El reporte HTML queda en `backend/coverage/index.html` (y en `mock-arbitro/` y `frontend/`).

## Cambios respecto al plan

### 1. OpenAPI del árbitro: de 0.9.0 a 1.0.1

Los planes se escribieron con la versión preliminar 0.9.0. El 4 de noviembre se publicó la 1.0.1 (versión final), que se subió a `docs/arbitro-openapi.json`. No cambian `/api/next` ni `/api/move`. Lo nuevo que nos afecta está en el mensaje del commit `dd069ef` y en `mock-arbitro/README.md`. Ver también `docs/HALLAZGOS.md` (ejemplo inconsistente del OpenAPI).

### 2. Node.js 22 en lugar de 20

Node 20 dejó de tener soporte en abril de 2026. Se pide Node 22 LTS o superior (`engines` en `package.json`).

### 3. Mock del árbitro con `node:http` en lugar de Fastify

- **Plan (PLAN_BACKEND.md §9):** mock con Fastify.
- **Qué se hizo:** servidor con el módulo `node:http` de Node, sin dependencias de servidor.
- **Por qué:** el mock tiene pocas rutas y ninguna necesita plugins. Sin dependencias se pudo levantar y probar con partidas reales en un entorno sin acceso a npm. Además, el long polling necesita detectar cuándo el bot cierra la conexión, y con `node:http` eso es directo (`res.on("close")`).
- **Separación:** la lógica vive en `mock-arbitro/src/arbiter.ts` (sin HTTP, con reloj inyectable) y `http.ts` solo traduce rutas. La API para la web (PLAN_BACKEND.md §8) sigue planeada con Fastify.

### 4. El mock reutiliza las reglas del backend

`mock-arbitro` importa `backend/src/rules/`. Ventaja: una sola implementación de las reglas, ya probada. Riesgo: si las reglas tuvieran un error, el mock no lo detectaría. Mitigación: el árbitro real valida con su propia implementación, y la práctica del jueves a las 8:00 contra el árbitro real es la prueba definitiva.

## Algoritmo (versión 1: alfa-beta)

Código en `backend/src/engine/`. Punto de entrada: `chooseMove(board, player, legalMoves, { budgetMs, now })`.

1. **Atajos:** una sola columna → se juega; jugada ganadora → se juega; un único cuatro inmediato del rival → se bloquea.
2. **Negamax con poda alfa-beta** (`search.ts`). En cada nodo: tablero lleno = 0; si el que mueve puede ganar ya, vale `WIN − fichas` (prefiere ganar rápido y perder tarde); en las hojas, heurística.
3. **Iterative deepening:** profundidad 1, 2, 3… hasta agotar el tiempo. Si se acaba en medio de una iteración (`TimeUp`), se usa la última completa. No se empieza otra iteración pasada la mitad del presupuesto.
4. **Orden de jugadas:** primero la mejor de la tabla de transposición o de la iteración anterior; luego del centro hacia afuera `[3, 4, 2, 5, 1, 6, 0, 7]`.
5. **Tabla de transposición** (`tt.ts`): hash Zobrist de 2 × 32 bits, ~1 millón de entradas en arreglos tipados.
6. **Heurística** (`evaluate.ts`): las 107 ventanas de 4 casillas del 8×7 (+50 por tres propias con hueco, +10 por dos, −60/−10 las del rival) y +3 por ficha en las columnas 3 y 4.
7. **Red de seguridad:** cualquier error → primera columna de `legal_moves` del centro hacia afuera. La columna devuelta siempre está en `legal_moves`.

### Mediciones (2026-11-04, Node 22, entorno de desarrollo de la IA)

| Posición | Sin tabla de transposición | Con tabla |
|---|---|---|
| Tablero vacío, 1,800 ms | profundidad 11, ~911 mil nodos, 1,316 ms | profundidad 13, ~1.25 millones de nodos, 1,574 ms |

Torneo local (`npm run tournament -w backend -- <rival> <partidas> <ms>`), alternando quién abre:

| Rival | Partidas | ms por jugada | Resultado | Profundidad media |
|---|---|---|---|---|
| casa-basico | 20 | 300 | 20 ganadas, 0 empates, 0 perdidas | 8.9 |
| casa-aleatorio | 10 | 100 | 10 ganadas | 8.9 |

| casa-basico (laptop de Claudia, macOS, Node 24.2) | 10 | **1,800** | 10 ganadas, 0 empates, 0 perdidas | 10.9 (mín 2, máx 17); jugada más lenta 1,801 ms |

Con 300 ms por jugada ya gana todo contra los bots de la casa; en el torneo se usan 1,800 ms. La siguiente comparación útil es contra otro motor (MCTS, ver plan de trabajo) y contra los otros equipos en amistosos.

### Cómo se verificó que la poda es correcta

- Prueba: alfa-beta (con y sin tabla) da **el mismo valor** que minimax sin poda a profundidad 4 en 12 posiciones aleatorias.
- Prueba de mutación manual: se rompió la poda a propósito (`alpha >= beta - 30`) y esas dos pruebas fallaron; se restauró.

## Cliente del árbitro

Código en `backend/src/arbiter/`; entrada en `backend/src/bot.ts` (`npm run bot`).

- `types.ts`: tipos del OpenAPI v1.0.1 y validación de las respuestas. Para jugar solo se exigen `game_id`, `you`, `board` (7×8) y `legal_moves`; los campos informativos que falten se rellenan con valores seguros. El bot usa `board` tal cual y **no** lo reconstruye desde `moves` (ver `docs/HALLAZGOS.md`).
- `client.ts`: `fetch` inyectable. `next` con tiempo máximo de `wait + 10 s`; `move` con 5 s. `401` lanza `AuthError`; `400`/`409` se devuelven como datos (`penalized` = la partida se perdió).
- `loop.ts`: ciclo infinito. La columna final siempre sale de `legal_moves`. Si el algoritmo falla, red de seguridad. Si se cae la red al enviar, se reintenta una vez si pasaron menos de 2.5 s (es seguro: si la jugada sí llegó, el árbitro responde 409). Errores de red o del árbitro: espera de 0.5, 1, 2 y 4 s como máximo, nunca 30 s sin preguntar. Solo `401` detiene el bot.

Verificado contra el mock: 3 prácticas contra casa-basico con 1,800 ms por jugada (dos abriendo nosotros, una abriendo la casa), 3 ganadas; profundidad 12–14 en las primeras jugadas.

## API para la app web

Contrato completo en `docs/API_WEB.md`. Código en `backend/src/api/`; entrada en `backend/src/web-api.ts` (`npm run api`).

- `handlers.ts`: router puro `handleApi({ method, path, query, body }) → { status, body }`. Sin estado: reconstruye el tablero desde `moves` validando cada jugada (rango, columna llena, jugadas después de ganar). `/bot-move` llama al mismo `chooseMove` que el bot del torneo.
- `server.ts`: capa `node:http` mínima (lee JSON, CORS, escribe la respuesta).
- Proceso separado del bot: una búsqueda de la web nunca retrasa un turno del torneo.

### 5. API con `node:http` en lugar de Fastify

- **Plan (PLAN_BACKEND.md §2 y §8):** Fastify, probado con `app.inject()`.
- **Qué se hizo:** `node:http` y un router puro que se prueba llamándolo directo.
- **Por qué:** mismo motivo que el mock (§3): pocas rutas, sin plugins, cero dependencias, y se pudo probar en un entorno sin npm. El objetivo de `inject()` (probar rutas sin abrir puertos) se cumple igual con `handleApi()`. `AGENTS.md` se actualizó.

## App web (frontend)

Código en `frontend/`. React + TypeScript + Vite; `npm run web`. Habla solo con la API de `docs/API_WEB.md` (proxy de Vite `/api` → `localhost:3001`) y no reimplementa reglas.

- `game/reducer.ts`: estado de la interfaz y selectores puros (a quién le toca, qué columnas se pueden jugar, textos de estado, deshacer, historial). Casi toda la lógica de la interfaz vive aquí y se prueba sin navegador.
- `game/useGame.ts`: hook que orquesta las llamadas (nueva partida, jugada, turno del bot, deshacer, reintentar) y guarda el estado (AGENTS.md).
- `api/client.ts`: `fetch` con tiempo máximo de 8 s y mensajes listos para mostrar; si la API está apagada, "No hay conexión con el bot…".
- Componentes de presentación: `Board`, `Disc`, `StatusBar`, `Controls`, `ResultBanner`, `MoveHistory`.

Diseño: un juego de mesa de plástico (tablero azul, huecos donde se ve la mesa). La única animación es la caída de la ficha, con un pequeño rebote; se desactiva con "reducir movimiento". Tus fichas son rojas y lisas; las del bot, amarillas con un anillo, para distinguirlas sin depender del color. Las columnas se muestran del 1 al 8. Botones reales por columna con `aria-label` ("Columna 4: 5 espacios libres"), flechas ← → para moverse y Enter para jugar. Responsivo: en pantallas angostas el panel baja debajo del tablero.

Capturas en `docs/img/` (laptop, teléfono, fin de partida, sin conexión).

### 6. Cambios respecto a PLAN_FRONTEND.md

- **React 19 en lugar de 18:** es la versión estable actual; no cambia nada del plan.
- **Pruebas de componentes con `react-dom/server` en lugar de Testing Library:** los componentes se renderizan a HTML y se revisa el resultado (56 casillas, columnas deshabilitadas, casillas ganadoras, textos). Ahorra `jsdom` y `@testing-library/*`, y se pudo correr en el entorno de la IA. Lo que no cubren (clics y llamadas encadenadas del hook) se probó con partidas reales en Chromium con Playwright: abrir humano y bot, deshacer, teclado, API caída y reintentar.
- **`useGame` sin pruebas unitarias propias:** su lógica está en `reducer.ts` (probado); el hook solo encadena llamadas y se verificó de punta a punta.
- **Opcionales hechos:** historial de jugadas, niveles de dificultad (`maxDepth`/`budgetMs`), deshacer y "qué pensó el bot". Pendiente: reproducir partidas del torneo (la API ya tiene `/replay`).
