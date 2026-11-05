# Documentación técnica

> En construcción. Se completa al final con la arquitectura final, el algoritmo, el manejo del tiempo y el reporte de cobertura.

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
