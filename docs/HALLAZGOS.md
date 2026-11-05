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
