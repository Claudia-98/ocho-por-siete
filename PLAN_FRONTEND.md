# PLAN_FRONTEND.md — App web Cuatro en línea 8×7 (Ocho por Siete · Equipo 4)

> Plan escrito **antes de la primera línea de código**. Las desviaciones se documentan en `docs/TECNICO.md`; este archivo no se reescribe.

## 1. Alcance

**Mínimo (obligatorio según las bases)**
- Tablero 8×7 interactivo, con indicación clara de a quién le toca y de qué columnas están disponibles.
- Elegir quién abre (humano o bot), reiniciar y mostrar el resultado: ganador con la línea de cuatro resaltada, o empate.
- Limpia, consistente y usable en una laptop. Responsiva para teléfono (puntos extra).
- Estados claros: turno, "el bot está pensando", jugada ilegal, fin de partida y error de conexión.

**Opcional, en este orden si sobra tiempo**
1. Historial de jugadas.
2. Niveles de dificultad (variando `budgetMs`).
3. Deshacer (quita la jugada del bot y la del humano).
4. Reproducir una partida del torneo a partir de su `game_id` (registro público del árbitro).
5. Panel "qué pensó el bot": profundidad, nodos y tiempo (útil en la exposición).

## 2. Stack

| Pieza | Elección | Por qué |
|---|---|---|
| Framework | React 18 + TypeScript + Vite | Arranque inmediato, recarga rápida, tipos compartidos con el backend |
| Estilos | CSS Modules + variables CSS (tema) | Sin dependencias extra; consistencia mediante variables |
| Pruebas | Vitest + Testing Library | Mismo runner que el backend; entra en `npm test` |

## 3. Pantallas

Una sola página con tres zonas:

```
┌──────────────────────────────────────────────┐
│  Cuatro en línea 8×7       [Ocho por Siete]  │  Encabezado
├──────────────────────────────────────────────┤
│  ● Tu turno  /  ◌ El bot está pensando…      │  Barra de estado
│                                              │
│   ▼  ▼  ▼  ▼  ▼  ▼  ▼  ▼   (indicador hover) │
│  ┌──┬──┬──┬──┬──┬──┬──┬──┐                   │
│  │  │  │  │  │  │  │  │  │   7 filas         │  Tablero
│  …                                           │
│  └──┴──┴──┴──┴──┴──┴──┴──┘                   │
│                                              │
│  [Nueva partida]  Abre: (●Yo) (○Bot)         │  Controles
│  Dificultad: [Normal ▾]   Historial ▸        │
└──────────────────────────────────────────────┘
```

- **Modal o banner de fin:** "¡Ganaste!", "Ganó el bot" o "Empate", con las 4 fichas ganadoras resaltadas en el tablero y un botón "Jugar otra vez".
- **Opcional:** vista "Repetir partida del torneo" con un campo para `game_id` y controles ⏮ ◀ ▶ ⏭.

## 4. Componentes

| Componente | Responsabilidad |
|---|---|
| `App` | Composición y layout |
| `useGame` (hook) | Estado de la partida: `moves`, `humanPlayer`, `status`, `thinking`, `error`; llama a la API |
| `api/client.ts` | `fetch` a `/api/v1/*`, tipado, con tiempo de espera y mensaje de error amigable |
| `Board` | Renderiza 7×8 celdas (fila 6 arriba en pantalla), maneja clic y teclado por columna |
| `Cell` / `Disc` | Ficha con animación de caída; resaltado si es parte de la línea ganadora |
| `StatusBar` | Texto e indicador de color de quién juega, "pensando…" y errores |
| `Controls` | Nueva partida, quién abre, dificultad |
| `ResultBanner` | Resultado final |
| `MoveHistory` (opc.) | Lista de jugadas |
| `ReplayViewer` (opc.) | Repetir una partida del árbitro |

La lógica de qué columna está llena, quién ganó y qué celdas resaltar **no se calcula en el frontend**: viene del backend (`legalMoves`, `status`, `winningCells`). El frontend solo dibuja y pide.

## 5. Comunicación con el bot

API del backend, definida en `PLAN_BACKEND.md` §8, sin estado (el frontend guarda `moves`):

1. **Nueva partida:** `POST /api/v1/state { moves: [] }` → tablero vacío. Si abre el bot, se encadena `POST /api/v1/bot-move`.
2. **Jugada humana:** `POST /api/v1/play { moves, column }` → nuevo estado (o `400 illegal_move`, que se muestra como aviso sin romper la partida).
3. **Respuesta del bot:** si `status === "playing"`, `POST /api/v1/bot-move { moves, budgetMs }` → `{ column, state, stats }`. Se anima la ficha del bot.
4. Mientras el bot piensa, el tablero se bloquea y aparece el indicador "pensando…".

En desarrollo, el proxy de Vite manda `/api` a `http://localhost:3001`. Para jugar desde otro dispositivo en la red local: `vite --host` y la IP de la laptop, documentado en el README y el manual.

## 6. Diseño visual

- Tablero azul con huecos; fichas en dos colores de alto contraste (rojo y amarillo) que además se distinguen por un borde y un patrón, para que se entiendan sin depender solo del color.
- Indicador sobre la columna al pasar el mouse (o con las flechas del teclado); columnas llenas atenuadas y con cursor `not-allowed`.
- Tipografía del sistema, espaciado con variables CSS, un único tema.
- Responsivo: el tablero escala con `min(90vw, 70vh)`; los controles bajan debajo del tablero en pantallas angostas. Objetivo táctil ≥ 44 px.
- Accesibilidad básica: botones reales por columna con `aria-label="Columna 4"`, foco visible y texto de estado con `aria-live`.

## 7. Pasos en orden y criterio de listo

| # | Paso | Listo cuando |
|---|---|---|
| 1 | Proyecto Vite + TS dentro del workspace, proxy a la API | `npm run dev` muestra la página y `/api/v1/health` responde |
| 2 | `Board` estático con datos falsos (mock local del cliente API) | Tablero 8×7 se ve bien en laptop y en teléfono |
| 3 | `useGame` + `api/client.ts` contra el backend real | Partida completa humano contra bot |
| 4 | Estados: turno, pensando, ilegal, error de red, fin | Cada estado se puede provocar y se ve claro |
| 5 | Resultado + línea ganadora + reiniciar + quién abre | Las 4 combinaciones (abre humano o bot, gana o empate) funcionan |
| 6 | Pulido visual y animaciones | Cero errores ni advertencias en consola |
| 7 | Pruebas de componentes | `npm test` incluye las pruebas del frontend |
| 8 | Capturas para `docs/MANUAL.md` | Manual entendible por alguien que no programa |
| 9 | Opcionales (§1) | — |

## 8. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Tablero dibujado al revés (fila 0 arriba) | Conversión en un solo lugar en `Board`; prueba que verifica que la primera ficha cae abajo |
| Doble clic manda dos jugadas | Bloquear la entrada mientras hay una petición en curso |
| El backend no responde | Tiempo de espera de 5 s en el cliente y mensaje "No se pudo contactar al bot" con botón para reintentar |
| CORS al abrir desde el teléfono | Proxy de Vite o CORS habilitado en la API |
| Se gasta tiempo en estética antes de que funcione | Orden de pasos: primero funcional (3–5), luego pulido (6) |

## 9. Cómo se valida

- **Pruebas de componentes (Testing Library):** `Board` dibuja 56 celdas y las columnas llenas están deshabilitadas; un clic llama a `play` con la columna correcta; `ResultBanner` muestra el ganador; `StatusBar` muestra "pensando…" mientras la promesa está pendiente. La API se simula.
- **Prueba manual con lista de chequeo:** partida completa abriendo cada uno, empate forzado, jugada en una columna llena, apagar el backend a mitad de partida, teléfono en la misma red.
- **Revisión de un compañero** que no hizo el frontend: debe poder jugar sin explicación (criterio "se entiende solo" de la rúbrica).

## 10. Qué se delega a la IA y cómo se verifica

| Se delega | Lo verifica una persona así |
|---|---|
| Andamiaje Vite y configuración del proxy | Funciona desde un clon limpio |
| Componentes y CSS a partir de este plan | Revisión visual en laptop y teléfono; consola sin errores |
| Pruebas de componentes | Se rompe el componente a propósito y la prueba debe fallar |
| Borrador del manual | Lo lee alguien sin contexto técnico y juega siguiéndolo |

Se anota en `docs/IA_LOG.md` lo que la IA hizo mal y cómo se corrigió.
