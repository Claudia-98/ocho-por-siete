# Hallazgos durante el desarrollo

Cosas que encontramos al revisar lo que nos entregaron o lo que generó la IA. Sirven para la exposición y para el PDF final.

## 1. Ejemplo inconsistente en el OpenAPI del árbitro (v1.0.1)

- **Dónde:** `docs/arbitro-openapi.json` → `GET /api/next` → respuesta `200` → ejemplo `turn`. El mismo ejemplo aparece en las bases (sección "Turno pendiente").
- **Cuándo / quién:** 2026-11-04, Claudia, al preparar las pruebas de `backend/src/rules/`.
- **Qué está mal:** los campos del ejemplo no describen la misma partida.

  | Campo | Dice el ejemplo | Lo que implica |
  |---|---|---|
  | `moves` | `[3,2,3,2,4,3,2,3]` (8 jugadas) | Deberían verse 8 fichas en el tablero |
  | `board` | 6 fichas (3 del jugador 1, 3 del jugador 2) | Corresponde a la jugada 7, no a la 9 |
  | `turn` | `9` | La jugada 9 es del jugador 1 (impar, abre el 1) |
  | `you` | `2` | Contradice a `turn` y a `moves` |
  | `last_move` | `{ by: 1, column: 3 }` | Según `moves`, la última jugada (columna 3) fue del jugador 2 |

  Además, al reconstruir `moves` jugada por jugada, el tablero resultante no coincide con `board` (por ejemplo, en la fila 0 da `[0,0,2,1,1,0,0,0]` y el ejemplo dice `[0,0,1,2,1,0,0,0]`).

- **Cómo se detectó:** la prueba `boardFromMoves → coincide con el dibujo equivalente` se construyó a mano con esos `moves` y el resultado no cuadraba con el `board` del ejemplo. Se verificó contando fichas con un script.
- **Puede ser intencional:** es posible que el ejemplo sea ilustrativo o una trampa para ver quién verifica. No cambia el contrato (los tipos y rutas están bien).
- **Qué decidimos:**
  - El bot confía en `board` y `legal_moves` del turno; **no** reconstruye el tablero desde `moves`.
  - No se usa ese ejemplo como dato de prueba "correcto". Si se usa en el mock o en pruebas del cliente, es solo para probar el parseo, no la lógica del juego.
  - Opcional: comparar `board` contra `moves` y dejar una advertencia en el log si no coinciden (sin cambiar la jugada).
- **Pendiente:** avisar a Edson por si quiere corregirlo.

## 2. Análisis de las derrotas contra Sleipnir y experimento descartado (jueves 9:15–9:30)

- **Contexto:** en los amistosos de la mañana, Sleipnir ganó sus 8 partidas, dos de ellas contra nosotros (en el árbitro aparecemos como "Flash"): `g_0c3069a3` (52 jugadas) y `g_16426c0b` (47 jugadas).
- **Tiempo:** Sleipnir usa en promedio 430–610 ms por jugada (máximo 1.1–1.5 s); nosotros 830–930 ms (máximo ~1.9 s). No nos ganan por pensar más tiempo.
- **Análisis:** reprodujimos ambas partidas y pusimos a nuestro motor a analizar cada jugada nuestra con 1,800 ms. En las dos, el motor descubre la derrota forzada recién en la jugada 27–30, cuando ya ve 17–29 jugadas adelante; hasta la 25 evaluaba la partida como pareja (−80 a +46). Es una derrota estratégica de final de partida: el rival arma una casilla ganadora que se decide más de 20 jugadas después, cuando las columnas se llenan. Subir el tiempo de 1,800 a 2,000 ms (una jugada más de profundidad) no lo resuelve.
- **Experimento:** se agregó a la heurística un bono por "amenazas diferidas" (tres en línea cuyo hueco todavía no se puede jugar) y se enfrentó contra la versión actual en 24 partidas por variante, con aperturas aleatorias de 4 jugadas y alternando quién abre, 250 ms por jugada:

  | Bono (propia / del rival) | Versión actual | Con amenazas | Empates |
  |---|---|---|---|
  | 30 / 40 | 14 | 8 | 2 |
  | 60 / 80 | 12 | 9 | 3 |
  | 120 / 150 | 13 | 9 | 2 |

- **Decisión:** **no se adopta**: en las tres variantes jugó peor. El bot del torneo queda como estaba (probado y medido). No se usó la "paridad de amenazas" clásica porque está pensada para columnas de altura par (7×6); en 8×7 las columnas tienen 7 casillas y la regla cambia.
- **Aprendizaje:** una mejora que suena razonable puede jugar peor; sin un torneo para medirla, la habríamos metido a ciegas 15 minutos antes del congelamiento.

### Segundo experimento: ajuste de pesos (jueves 9:26–9:30)

Mismo método (aperturas aleatorias de 4 jugadas, alternando quién abre, 250 ms por jugada), contra la versión actual:

| Variante | Partidas | Versión actual | Variante | Empates |
|---|---|---|---|---|
| Centro ×2 (`center` 3 → 6) | 72 | 33 | 33 | 6 |
| Centro ×3 (`center` 3 → 9) | 48 | 25 | 22 | 1 |
| Defensa más fuerte (`oppThree` 60 → 80) | 24 | 14 | 9 | 1 |
| Más peso a dos en línea (`two` 10 → 20) | 24 | 13 | 9 | 2 |
| Menos peso a dos en línea (`two` 10 → 5) | 24 | 12 | 10 | 2 |

El centro ×2 parecía mejor en la primera ronda (13–10), pero con 48 partidas nuevas quedó empatado: era ruido. **Ninguna variante supera a la actual; los pesos se quedan como están.**

## 3. Pesos distintos según quién abre (jueves, día del challenge)

- **Idea:** quien abre (jugador 1) suele ganar, así que jugar agresivo y por el centro cuando abrimos, y defensivo cuando abre el rival. Nunca se habían probado pesos que dependieran del lado.
- **Código:** `evaluate`, `Searcher` y `chooseMove` aceptan un juego de pesos opcional (por defecto `WEIGHTS`, así el bot del torneo no cambia). La comparación se corre con `npm run compare -w backend -- <A|B|C|igual> [partidas] [ms] [semilla]` (`backend/scripts/compare.ts`).
- **Método:** el de §2. Aperturas aleatorias de 4 jugadas con semilla; cada apertura se juega dos veces cambiando quién abre; 250 ms por jugada; cada motor con su propia tabla de transposición. Se agregó un **control** (la versión actual contra sí misma) para medir cuánto ruido hay.
- **Variantes:**
  - **A, agresivo al abrir:** como jugador 1, `center` 3 → 6 y `three` 50 → 65; como jugador 2, pesos actuales.
  - **B, defensivo al responder:** como jugador 2, `oppThree` 60 → 80 y `oppTwo` 10 → 15; como jugador 1, pesos actuales.
  - **C:** A y B juntas.

Resultados (variante · empates · actual), 72 partidas por fila:

| Variante | Semilla | Total | Abre la variante (J1) | Abre la actual (variante = J2) |
|---|---|---|---|---|
| A | 2026 | 40 · 4 · 28 | 29 · 2 · 5 | 11 · 2 · 23 |
| B | 2026 | 29 · 2 · 41 | 24 · 1 · 11 | 5 · 1 · 30 |
| C | 2026 | 29 · 2 · 41 | 24 · 0 · 12 | 5 · 2 · 29 |
| Control (actual vs. actual) | 2026 | 37 · 2 · 33 | 28 · 1 · 7 | 9 · 1 · 26 |
| A (repetición) | 2027 | 32 · 1 · 39 | 21 · 0 · 15 | 11 · 1 · 24 |
| Control (actual vs. actual) | 2027 | 33 · 8 · 31 | 24 · 3 · 9 | 9 · 5 · 22 |

- **Quien abre gana casi siempre:** incluso el control gana 52 de 72 como jugador 1 (y pierde 16). La intuición era correcta, pero no se traduce en una mejora de pesos.
- **A no mejora.** Su 40–28 de la primera ronda era engañoso: cuando A es el jugador 2 usa exactamente los pesos actuales, así que esas partidas son ruido puro. Donde A sí cambia algo (abriendo), sumando las dos semillas sacó 50 · 2 · 20, frente a 52 · 4 · 16 del control. En la repetición quedó por debajo del control (21–15 contra 24–9).
- **B y C empeoran** justo donde cambian: como jugador 2 ganaron 5 de 36, contra 9 de 36 del control. Coincide con §2 (`oppThree` 80 ya había jugado peor).
- **Ruido:** con los mismos pesos, el resultado de 36 partidas puede variar ±4 entre corridas (por el reloj y la tabla de transposición). Una diferencia de ese tamaño no prueba nada; por eso se repite con otra semilla y se compara contra un control.
- **Decisión:** **no se adopta ninguna variante.** Los pesos y `BUDGET_MS` del torneo quedan como estaban.
### Tercer experimento: búsqueda más rápida (jueves, tiempo extra)

- **Detección rápida de victorias (adoptada):** en vez de colocar la ficha, revisar las 4 direcciones y quitarla, se usa una tabla precalculada con las ventanas de 4 que pasan por cada casilla (`CELL_TRIPLES` en `position.ts`). Mismo resultado, sin modificar el tablero.
  - Mismas posiciones revisadas a profundidad fija (234,700 en ambas versiones) → **decide exactamente igual**; 149 pruebas en verde, incluida alfa-beta == minimax.
  - **50 % más rápido:** 472 → 709 posiciones por milisegundo (sin otros procesos).
  - Torneo contra la versión registrada (48 partidas, 250 ms, 4 torneos en paralelo): 23 nueva, 24 registrada, 1 empate. Sin diferencia medible en resultados; se adopta porque no cambia las decisiones y da algo más de profundidad con el mismo tiempo (decisión del equipo).
- **History heuristic (descartada):** redujo las posiciones revisadas solo un 2 % y el costo de ordenar la hizo más lenta en total (434 ms contra 331 ms a profundidad 1–10).
