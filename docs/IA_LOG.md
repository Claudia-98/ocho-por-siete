# Registro de uso de IA

Cada vez que la IA propone algo incorrecto (un bug, una suposición de 7×6, una prueba que no prueba nada) se agrega una entrada. Formato en `AGENTS.md`.

---

### 2026-11-04 · Claudia · Claude (claude.ai)

- **Qué se pidió:** armar el andamiaje del monorepo y las reglas del juego, y subirlos al repo.
- **Qué devolvió mal:** el mensaje del commit `c19514c` (andamiaje) dice "revisado por Claudia" antes de que Claudia revisara el código.
- **Cómo se detectó:** la propia IA lo señaló al terminar, al releer los mensajes de commit.
- **Cómo se corrigió:** no se reescribió el historial (AGENTS.md lo prohíbe en commits publicados). Claudia revisa el código y queda registrado aquí. Aprendizaje: la IA no debe afirmar revisiones humanas que no han pasado; en los commits se indica solo "generado con IA".

### 2026-11-04 · Claudia · Claude (claude.ai)

- **Qué se pidió:** correr las pruebas con Vitest.
- **Qué pasó:** el entorno de la IA no tenía acceso a npm, así que no pudo instalar Vitest. Corrió las mismas pruebas con `node:test` mediante un sustituto local (no subido): 36/36 y 100 % de cobertura en `rules/`.
- **Cómo se verifica:** correr `npm install && npm test` en una máquina del equipo y confirmar el mismo resultado con Vitest.
- **Verificado (2026-11-04, Claudia):** en macOS con Node 24.2.0, Vitest 3.2.7 corrió 36/36 pruebas y 100 % de cobertura en `rules/`, igual que el sustituto. Se subió `package-lock.json`.

### 2026-11-04 · Claudia · Claude (claude.ai)

- **Qué se pidió:** el mock del árbitro con sus pruebas.
- **Qué devolvió mal:** en la prueba "casa-basico gana si puede", la IA dibujó tres fichas O en la fila 1 con la columna 3 vacía debajo. La ficha nueva caía a la fila 0 y no completaba el cuatro, así que la prueba esperaba algo imposible (un error típico al dibujar tableros: olvidar la gravedad).
- **Cómo se detectó:** al correr las pruebas falló con `expected null toBe 3`. Se revisó el dibujo, no el código del bot de la casa.
- **Cómo se corrigió:** se puso una X debajo (`XXXO....` en la fila 0) para que la O caiga en la fila 1. Aprendizaje: cuando una prueba falla, revisar primero si la prueba es correcta.

### 2026-11-04 · Claudia · Claude (claude.ai)

- **Qué se pidió:** el motor alfa-beta con sus pruebas.
- **Qué devolvió mal:** en `chooseMove`, la red de seguridad (`catch` final) volvía a llamar al reloj para medir el tiempo. Si el error venía justamente del reloj, la excepción se escapaba y el bot no habría enviado jugada (derrota por tiempo).
- **Cómo se detectó:** al escribir la prueba "si el reloj falla, cae a la red de seguridad", antes de correrla, revisando el camino del error.
- **Cómo se corrigió:** el reloj se lee dentro de un `try` y, si falla, se usa el inicio como referencia. La prueba queda en `test/engine/search.test.ts`.
- **Extra:** para comprobar que las pruebas de la poda sirven, se metió un error a propósito en alfa-beta y las pruebas lo detectaron (ver `docs/TECNICO.md`).
