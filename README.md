# Ocho por Siete · Cuatro en línea 8×7

Bot y app web del Equipo 4 para el challenge de Yompi (5 de noviembre de 2026).

- Planes: [PLAN_BACKEND.md](PLAN_BACKEND.md), [PLAN_FRONTEND.md](PLAN_FRONTEND.md)
- Reglas para agentes de IA: [AGENTS.md](AGENTS.md)
- Contrato del árbitro (v1.0.1): [docs/arbitro-openapi.json](docs/arbitro-openapi.json)
- Documentación técnica: [docs/TECNICO.md](docs/TECNICO.md)
- Manual de la app: [docs/MANUAL.md](docs/MANUAL.md)
- Día del evento y guion de la exposición: [docs/EXPOSICION.md](docs/EXPOSICION.md)

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

Corre todas las pruebas y muestra el reporte de cobertura. Si la cobertura de `backend/src/rules/` o `backend/src/engine/` baja de 70 %, el comando falla. El reporte HTML queda en `backend/coverage/index.html`.

Otros comandos:

| Qué | Comando |
|---|---|
| Revisar tipos | `npm run typecheck` |
| Mock del árbitro (puerto 4000) | `npm run mock` |
| API para la app web (puerto 3001) | `npm run api` |
| App web (puerto 5173) | `npm run web` |
| Registrar la entrega | `npm run submit` |
| Pruebas en modo observación (backend) | `npm run test:watch -w backend` |

## Correr el bot

```bash
cp .env.example .env        # una sola vez; completar ARBITRO_URL y TEAM_TOKEN
npm run bot                 # juega los turnos que le asigne el árbitro, hasta Ctrl+C
npm run bot -- --practice casa-basico            # además crea una práctica al arrancar
npm run bot -- --practice casa-basico --first 2 --games 3
```

Contra el mock local: en una terminal `npm run mock`; en otra, con `ARBITRO_URL=http://localhost:4000` y `TEAM_TOKEN=dev-eq4` en el `.env`, `npm run bot -- --practice casa-basico`.

Cada turno deja una línea en la consola: partida, turno, columna, profundidad, nodos, tiempo, valor y resultado. Si el token es inválido el bot se detiene con un mensaje claro; ante cualquier otro error (red, árbitro caído) sigue reintentando.

## Jugar en la app web

Dos terminales, desde la raíz del repo:

```bash
npm run api     # el bot para la web (puerto 3001)
npm run web     # la app (puerto 5173)
```

Abrir http://localhost:5173. Para jugar desde el teléfono en la misma red Wi-Fi, abrir `http://<IP de la laptop>:5173` (Vite muestra la dirección al arrancar). Cómo se juega: [docs/MANUAL.md](docs/MANUAL.md).

## Registrar la entrega (antes de las 9:45)

```bash
git push
npm run submit      # registra en el árbitro la URL del repo y el hash del commit actual
```

Avisa si hay cambios sin commit o sin push y muestra lo que quedó registrado. Se puede repetir: vale el último registro.

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
| `backend/src/engine/` — algoritmo alfa-beta | ✅ con pruebas — `npm run tournament -w backend` |
| `backend/src/arbiter/` — cliente del árbitro | ✅ con pruebas — `npm run bot` |
| `backend/src/api/` — API para la web | ✅ con pruebas — `npm run api`, contrato en [docs/API_WEB.md](docs/API_WEB.md) |
| `mock-arbitro/` — árbitro falso (v1.0.1) | ✅ con pruebas — `npm run mock`, ver [mock-arbitro/README.md](mock-arbitro/README.md) |
| `frontend/` — app web React | ✅ con pruebas — `npm run web` |

