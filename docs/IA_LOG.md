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
