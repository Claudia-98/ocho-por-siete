# Jueves 5 de noviembre: pasos del día y guion de la exposición

## 1. Lista de pasos

### Antes de las 8:00 (en casa o al llegar)

- [ ] Laptop del bot **cargando** y con el **Wi-Fi** del evento probado.
- [ ] En la carpeta del proyecto: `git pull`, `npm install`, `npm test` (todo en verde).
- [ ] Ensayar la demo una vez: `npm run api` + `npm run web` → http://localhost:5173.

### 8:00 – 8:15: conectar al árbitro real

1. Anotar la **URL del árbitro** y el **token** del equipo. El token **no** se pega en el chat del equipo ni en el repo.
2. Editar el `.env` (en la raíz del proyecto):
   ```
   ARBITRO_URL=https://<la URL que publiquen>
   TEAM_TOKEN=<el token del equipo>
   ```
3. Revisar el OpenAPI definitivo: abrir `<ARBITRO_URL>/api/openapi.json` y comparar `info.version` con la nuestra (`1.0.1`). Si cambió, avisar: se reemplaza `docs/arbitro-openapi.json` y se revisa `backend/src/arbiter/types.ts`.
4. Arrancar el bot **sin que la Mac se duerma** y con una práctica:
   ```bash
   caffeinate -dims npm run bot -- --practice casa-basico
   ```
   Debe decir `Conectado como "…"` y, al rato, `¡GANAMOS!`. Si dice `Token inválido (401)`, revisar el `.env`.
5. Ver la partida en el tablero en vivo (la URL del árbitro en el navegador).

### 8:15 – 9:45: desarrollo e integración

- Más prácticas: `npm run bot -- --practice casa-basico --first 2 --games 3` (en otra terminal, mientras el bot sigue corriendo, o reiniciándolo).
- Amistosos con otros equipos si se piden.
- Cada cambio: `npm test` → commit → push.

### 9:30: registrar la entrega (¡antes de las 9:45!)

```bash
git status            # nada pendiente
git push
npm run submit        # registra la URL del repo y el hash del commit actual
```

`npm run submit` avisa si hay cambios sin commit o sin push, y al final muestra lo que quedó registrado en el árbitro. Se puede repetir: vale el último registro. Lo que se suba después del commit registrado **no se evalúa**.

### 9:45 en adelante: liga

- **No apagar ni cerrar la laptop del bot** (perder un turno por 30 s = derrota por ausencia). Dejarla conectada a la corriente, con `caffeinate`, la tapa abierta y la terminal abierta.
- No tocar el código del bot durante la liga.
- La demo de la exposición se hace en **otra** laptop o con `npm run api` / `npm run web` en la misma (son procesos aparte: no frenan al bot).

## 2. Guion de la exposición (10 minutos)

Distribución sugerida por las bases: 2 min de demo, 6 de algoritmo y uso de IA, 2 de preguntas. **El jurado puede preguntarle a cualquiera**: todos repasan las secciones 2.2 y 3.

### 2.1 Demo (2 min) — _quién: ______

1. Abrir la app (http://localhost:5173) y jugar 4–5 jugadas en **Normal**.
2. Señalar la línea bajo "Tu turno": *"El bot miró 13 jugadas adelante: 1.4 millones de posiciones en 0.9 s"*.
3. Hacer una amenaza de tres para mostrar *"El bot bloqueó tu cuatro en línea"*.
4. Mostrar **Deshacer**, **Quién abre: El bot** y el teléfono (dirección `Network:` de Vite).
5. Si sobra tiempo: la terminal del bot con una línea por turno (profundidad, nodos, ms).

### 2.2 Algoritmo (3 min) — _quién: ______

Mensaje central: **alfa-beta con iterative deepening, con tiempo controlado y probado contra minimax.**

- **Por qué alfa-beta y no Monte Carlo:** Cuatro en línea es determinista, de información completa y con 8 jugadas posibles como máximo: es el caso clásico de minimax. Alfa-beta ve las secuencias forzadas de forma exacta; MCTS necesitaría muchas simulaciones para no caer en trampas tácticas. (MCTS queda como segundo motor para comparar con datos, si da tiempo.)
- **Cómo decide (en orden):**
  1. Atajos: única columna → la juega; puede ganar ya → gana; el rival gana en la siguiente → bloquea.
  2. **Negamax con poda alfa-beta:** explora jugadas y descarta ramas que el rival nunca permitiría.
  3. **Iterative deepening:** busca a profundidad 1, 2, 3… y siempre tiene lista la mejor jugada de la última profundidad completa.
  4. **Orden de jugadas:** primero la mejor conocida, luego del centro hacia afuera (3, 4, 2, 5, 1, 6, 0, 7). En 8 columnas el centro son **dos**: la 3 y la 4.
  5. **Tabla de transposición:** a la misma posición se llega por muchos caminos (3 y luego 4 = 4 y luego 3); se recuerda con un hash Zobrist. Pasamos de profundidad 11 a 13 en el mismo tiempo.
  6. **Heurística:** las **107 ventanas** de 4 casillas del 8×7 (35 horizontales, 32 verticales, 40 diagonales): +50 por tres propias con hueco, +10 por dos, −60/−10 las del rival, +3 por ficha en las columnas centrales.
- **Manejo del tiempo:** el árbitro da 3,000 ms; usamos **1,800**. Contamos desde que llega el turno (no comparamos con `served_at` para no depender de relojes desfasados). La búsqueda revisa el reloj cada 1,024 nodos y aborta; nunca empieza una iteración pasada la mitad del tiempo. Jugada más lenta medida: **1,801 ms**.
- **Números:** profundidad **13–14** en la primera jugada (1.2–1.7 millones de posiciones). Torneo local con 1,800 ms: **10 de 10** contra casa-basico.

### 2.3 Cómo usamos la IA (3 min) — _quién: ______

Mensaje central: **la IA escribió la mayor parte del código; nosotros la dirigimos con planes y reglas, y verificamos todo con pruebas, partidas reales y capturas.**

- **Cómo la dirigimos:** primero los planes (`PLAN_BACKEND.md`, `PLAN_FRONTEND.md`) y `AGENTS.md` con reglas para la IA: fila 0 abajo, centro = columnas 3 y 4, nada de valores del 7×6, tiempo inyectado, nunca tocar los planes ni el token.
- **Qué falló y cómo lo detectamos** (todo en `docs/IA_LOG.md`), elegir 2 o 3:
  - Una prueba dibujaba fichas **flotando** (sin gravedad) y esperaba algo imposible → lo detectó la propia prueba.
  - La **red de seguridad** del algoritmo se caía si el reloj fallaba → revisando el camino del error al escribir la prueba.
  - Con **token inválido** el bot se caía, y si el árbitro no respondía al arrancar **se salía** (= derrota por ausencia) → probando el programa completo contra el mock, no con unit tests.
  - Una franja blanca en el tablero por **especificidad de CSS**, y el primer arreglo de la IA tampoco servía → lo vimos en capturas de pantalla.
  - **Dos versiones de Vite** en el monorepo → el typecheck falló en la laptop de Claudia.
- **Verificar lo que nos entregaron:** el ejemplo de `/api/next` del OpenAPI oficial no es consistente (8 jugadas en `moves`, 6 fichas en `board`, `you` no cuadra con `turn`) → decidimos confiar en `board` y `legal_moves` (`docs/HALLAZGOS.md`).
- **Cómo verificamos que la poda no cambia la decisión:** prueba alfa-beta == minimax sin poda; y metimos un error a propósito en la poda para confirmar que la prueba lo atrapa.

### 2.4 Preguntas (2 min)

Ver la sección 3.

## 3. Preguntas probables del jurado

| Pregunta | Respuesta corta |
|---|---|
| ¿Por qué alfa-beta y no MCTS? | Juego determinista, de información completa y con pocas jugadas por turno: alfa-beta ve las secuencias forzadas exactas. MCTS necesita muchas simulaciones para no caer en trampas tácticas. |
| ¿Qué pasa si se acaba el tiempo a mitad de búsqueda? | Se lanza `TimeUp`, se descarta esa iteración y se juega la mejor de la última profundidad completa. |
| ¿Y si el algoritmo falla o devuelve algo raro? | Red de seguridad: la columna final siempre sale de `legal_moves` (la más central). Si el algoritmo lanza un error, se juega igual. |
| ¿Por qué 1,800 ms y no 2,900? | Margen para la red del evento. Las bases recomiendan pensar como máximo 2,000. |
| ¿Por qué no usan `served_at`? | Compararlo con el reloj de la laptop depende de que ambos relojes estén sincronizados. Medimos desde que llega la respuesta. |
| ¿Qué es la tabla de transposición? | Memoria de posiciones ya calculadas, con su valor y su mejor jugada. Evita recalcular la misma posición alcanzada por caminos distintos. |
| ¿Qué cambia del 7×6 al 8×7? | Dos columnas centrales (3 y 4), 107 ventanas de 4 en vez de 69, 56 casillas. No se puede usar un solucionador del 7×6. |
| ¿Cómo saben que la poda es correcta? | Prueba que compara alfa-beta (con y sin tabla) contra minimax sin poda en 12 posiciones; y prueba de mutación (rompimos la poda y la prueba falló). |
| ¿Qué pasa si el bot pierde la conexión? | Reintenta esperando 0.5, 1, 2 y 4 s como máximo; nunca pasa 30 s sin preguntar. Si se cae justo al enviar la jugada, la reintenta una vez (si ya había llegado, el árbitro responde 409 sin penalizar). Solo se detiene con token inválido. |
| ¿El bot de la web es el mismo del torneo? | Sí: la API llama a la misma función `chooseMove`. Corre en otro proceso para no retrasar los turnos del torneo. |
| ¿El frontend calcula reglas? | No. La API devuelve tablero, columnas legales, ganador y casillas ganadoras; el frontend solo dibuja. |
| ¿Qué cambió respecto al plan? | Node 22 (Node 20 ya no tiene soporte), `node:http` en vez de Fastify para el mock y la API, React 19, pruebas de componentes con `react-dom/server`. Todo explicado en `docs/TECNICO.md` → "Cambios respecto al plan". |
| ¿Cuántas pruebas y qué cobertura? | Un solo comando (`npm test`) corre backend, mock y frontend; cobertura de reglas y algoritmo por encima del 95 % (mínimo exigido 70 %, configurado como umbral). |
| ¿Qué le pidieron a la IA y qué no le delegaron? | Le delegamos el código a partir de los planes. No delegamos: decisiones de tiempo y seguridad, revisar que las pruebas prueben algo, mirar la app funcionando y registrar la entrega. |
