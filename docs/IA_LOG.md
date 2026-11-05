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

### 2026-11-04 · Claudia · Claude (claude.ai)

- **Qué se pidió:** el cliente del árbitro (`npm run bot`) con pruebas.
- **Qué devolvió mal (1):** una prueba esperaba que, con `legal_moves = [2, 5]`, la red de seguridad eligiera la 5. Lo correcto es la 2, porque el orden es 3, 4, 2, 5… La prueba estaba mal, no el código.
- **Qué devolvió mal (2):** con un token inválido, el bot se caía con un error técnico de Node en vez de un mensaje claro; y si el árbitro no respondía al arrancar, el bot se salía en vez de reintentar (mañana eso sería derrota por ausencia).
- **Cómo se detectó:** (1) al correr las pruebas; (2) al probar el bot de punta a punta contra el mock con un token malo y con el mock apagado.
- **Cómo se corrigió:** (1) se corrigió la prueba; (2) `bot.ts` muestra "Token inválido (401). Revisa TEAM_TOKEN." y, si el árbitro está caído al inicio, avisa y sigue reintentando.
- **Aprendizaje:** las pruebas unitarias del ciclo pasaban; el problema estaba en el punto de entrada, que solo se ve probando el programa completo.

### 2026-11-04 · Claudia · Claude (claude.ai)

- **Qué se pidió:** la app web en React.
- **Qué devolvió mal (1):** al pasar el mouse por una columna del tablero se pintaba una franja blanca: los estilos generales de `button` le ganaban a la clase de la columna. El primer arreglo (`:where(button):hover`) **tampoco** sirvió, porque `:where()` solo anula lo que está adentro del paréntesis y `:hover` quedaba afuera.
- **Cómo se detectó:** revisando capturas de pantalla de partidas reales (Playwright); después, midiendo el color de fondo calculado de la columna.
- **Cómo se corrigió:** todo el selector dentro de `:where(button:hover:not(:disabled))`.
- **Qué devolvió mal (2):** una prueba suponía que React escribe `value="bot" checked`; React escribe `checked="" value="bot"`. Se cambió la prueba para no depender del orden de los atributos.
- **Qué devolvió mal (3):** textos poco claros detectados en las capturas: "en 0.0 s" (ahora "en un instante") y, con la API apagada detrás del proxy de Vite, "El bot respondió algo inesperado" en vez de "No hay conexión con el bot".
- **Aprendizaje:** las pruebas pasaban en los tres casos; los errores visuales y de texto solo aparecieron mirando la app funcionando.

### 2026-11-04 · Claudia · Claude (claude.ai)

- **Qué se pidió:** configurar Vite para el frontend.
- **Qué devolvió mal:** la IA fijó `vite ^6` en `frontend/`, pero Vitest (instalado en la raíz por el backend y el mock) ya había traído Vite 7. Quedaron dos copias de Vite y `npm run typecheck` falló en `vite.config.ts`: el plugin de React tenía los tipos de una versión y `defineConfig` los de la otra.
- **Cómo se detectó:** al correr `npm run typecheck` en la laptop de Claudia (en el entorno de la IA no había npm para instalar Vite).
- **Cómo se corrigió:** `vite ^7.3.0` y `@vitejs/plugin-react ^4.7.0` en `frontend/package.json`; con una sola versión de Vite en el workspace, los tipos coinciden. Se verificó en el `package-lock.json` qué versiones había instalado npm.
- **Aprendizaje:** en un monorepo con workspaces, las versiones de herramientas compartidas (Vite, Vitest, TypeScript) tienen que coincidir entre paquetes.
