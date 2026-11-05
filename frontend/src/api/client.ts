// Llamadas a la API del backend (docs/API_WEB.md). `fetch` se inyecta para probar sin red.
import type { BotMoveResponse, GameState } from "../game/model";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Error que la interfaz puede mostrar tal cual. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const NETWORK_MESSAGE = "No hay conexión con el bot. Revisa que la API esté corriendo y vuelve a intentar.";
const TIMEOUT_MS = 8000;

export interface BotClient {
  state(moves: number[]): Promise<GameState>;
  play(moves: number[], column: number): Promise<GameState>;
  botMove(moves: number[], options: { budgetMs: number; maxDepth?: number }): Promise<BotMoveResponse>;
}

export function createClient(baseUrl = "/api/v1", fetchFn: FetchLike = (u, i) => fetch(u, i)): BotClient {
  async function post<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetchFn(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError("network", NETWORK_MESSAGE);
    } finally {
      clearTimeout(timer);
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      // El proxy de Vite responde 5xx sin JSON cuando la API está apagada: es un problema de conexión.
      if (res.status >= 500) throw new ApiError("network", NETWORK_MESSAGE, res.status);
      throw new ApiError("bad_response", "El bot respondió algo inesperado. Vuelve a intentar.", res.status);
    }
    if (!res.ok) {
      const err = data as { error?: unknown; message?: unknown };
      const code = typeof err?.error === "string" ? err.error : `http_${res.status}`;
      const message = typeof err?.message === "string" ? err.message : "Algo salió mal. Vuelve a intentar.";
      throw new ApiError(code, message, res.status);
    }
    return data as T;
  }

  return {
    state: (moves) => post<GameState>("/state", { moves }),
    play: (moves, column) => post<GameState>("/play", { moves, column }),
    botMove: (moves, options) => post<BotMoveResponse>("/bot-move", { moves, ...options }),
  };
}
