# Ocho por Siete · Cuatro en línea 8×7

Bot y app web del Equipo 4 para el challenge de Yompi (5 de noviembre de 2026).

- Planes: [PLAN_BACKEND.md](PLAN_BACKEND.md), [PLAN_FRONTEND.md](PLAN_FRONTEND.md)
- Reglas para agentes de IA: [AGENTS.md](AGENTS.md)
- Contrato del árbitro (v1.0.1): [docs/arbitro-openapi.json](docs/arbitro-openapi.json)

## Requisitos

- Node.js 22 LTS o superior (`node -v`)

## Instalación

```bash
npm install
```

Se corre una sola vez, en la raíz del repo; instala todos los workspaces.

## Pruebas (comando único)

```bash
npm test
```

Corre todas las pruebas y muestra el reporte de cobertura. Si la cobertura de `backend/src/rules/` baja de 70 %, el comando falla. El reporte HTML queda en `backend/coverage/index.html`.

Otros comandos:

| Qué | Comando |
|---|---|
| Revisar tipos | `npm run typecheck` |
| Mock del árbitro (puerto 4000) | `npm run mock` |
| Pruebas en modo observación (backend) | `npm run test:watch -w backend` |

## Variables de entorno

Copiar `.env.example` a `.env` y completar. `.env` no se sube al repo.

| Variable | Para qué |
|---|---|
| `ARBITRO_URL` | URL del árbitro (se publica el jueves a las 8:00). En local, el mock. |
| `TEAM_TOKEN` | Token del equipo. **Nunca** en el repo. |
| `BUDGET_MS` | Tiempo máximo de búsqueda por jugada (1800 por defecto). |
| `PORT` | Puerto de la API para la app web (3001). |

## Estado

| Módulo | Estado |
|---|---|
| `backend/src/rules/` — reglas del juego | ✅ con pruebas |
| `backend/src/engine/` — algoritmo | pendiente |
| `backend/src/arbiter/` — cliente del árbitro | pendiente |
| `backend/src/api/` — API para la web | pendiente |
| `mock-arbitro/` — árbitro falso (v1.0.1) | ✅ con pruebas — `npm run mock`, ver [mock-arbitro/README.md](mock-arbitro/README.md) |
| `frontend/` | pendiente |

El bot, la API y la web (`npm run bot`, `api`, `web`) se agregan con sus módulos.
