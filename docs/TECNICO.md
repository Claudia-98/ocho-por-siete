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
