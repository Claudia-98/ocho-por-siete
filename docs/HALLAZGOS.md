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
