// Llamadas HTTP al árbitro. `fetch` se inyecta para probarlo sin red.
import {
  isApiError,
  parseMoveAccepted,
  parseNextResponse,
  ProtocolError,
  type ApiError,
  type MoveAccepted,
  type NextResponse,
} from "./types.js";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Token inválido: no tiene sentido reintentar. */
export class AuthError extends Error {
  constructor(message = "Token inválido (401). Revisa TEAM_TOKEN.") {
    super(message);
    this.name = "AuthError";
  }
}

export type MoveResult =
  | { kind: "accepted"; response: MoveAccepted }
  /** 400 / 409 / otros: el árbitro respondió con un error. `penalized` = la partida se perdió. */
  | { kind: "rejected"; status: number; error: ApiError; penalized: boolean };

export interface ArbiterClientOptions {
  baseUrl: string;
  token: string;
  fetch?: FetchLike;
  /** Margen sobre `wait` para dar por muerta una conexión de long polling. */
  nextTimeoutMarginMs?: number;
  /** Tiempo máximo para que responda POST /api/move. */
  moveTimeoutMs?: number;
}

/** Errores que hacen perder la partida (OpenAPI: illegal_move y timeout). */
const PENALIZED = new Set(["illegal_move", "timeout"]);

export class ArbiterClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetch: FetchLike;
  private readonly nextTimeoutMarginMs: number;
  private readonly moveTimeoutMs: number;

  constructor(options: ArbiterClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.headers = { Authorization: `Bearer ${options.token}`, "Content-Type": "application/json" };
    this.fetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
    this.nextTimeoutMarginMs = options.nextTimeoutMarginMs ?? 10_000;
    this.moveTimeoutMs = options.moveTimeoutMs ?? 5_000;
  }

  /** GET /api/next?wait=N (long polling). */
  async next(waitSeconds = 20): Promise<NextResponse> {
    const res = await this.fetch(`${this.baseUrl}/api/next?wait=${waitSeconds}`, {
      headers: this.headers,
      signal: AbortSignal.timeout(waitSeconds * 1000 + this.nextTimeoutMarginMs),
    });
    const body = await readJson(res);
    if (res.status === 401) throw new AuthError();
    if (!res.ok) throw new ProtocolError(`/api/next respondió ${res.status}.`, body);
    return parseNextResponse(body);
  }

  /** POST /api/move. Nunca lanza por 400/409: devuelve el error para que el ciclo decida. */
  async move(gameId: string, column: number): Promise<MoveResult> {
    const res = await this.fetch(`${this.baseUrl}/api/move`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ game_id: gameId, column }),
      signal: AbortSignal.timeout(this.moveTimeoutMs),
    });
    const body = await readJson(res);
    if (res.status === 401) throw new AuthError();
    if (res.ok) return { kind: "accepted", response: parseMoveAccepted(body) };
    const error: ApiError = isApiError(body) ? body : { ok: false, error: `http_${res.status}`, message: JSON.stringify(body) };
    return { kind: "rejected", status: res.status, error, penalized: PENALIZED.has(error.error) };
  }

  /** POST /api/practice. */
  async practice(opponent: "casa-aleatorio" | "casa-basico", first: 1 | 2): Promise<{ game_id: string; you?: number }> {
    const res = await this.fetch(`${this.baseUrl}/api/practice`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ opponent, first }),
    });
    const body = await readJson(res);
    if (res.status === 401) throw new AuthError();
    if (!res.ok || typeof (body as { game_id?: unknown })?.game_id !== "string") {
      throw new ProtocolError(`/api/practice respondió ${res.status}.`, body);
    }
    return body as { game_id: string; you?: number };
  }

  /** PUT /api/me/submission — registra el repo y el hash del commit final (antes de las 9:45). */
  async submit(repoUrl: string, commit: string): Promise<{ repo_url: string; commit: string; registered_at?: string }> {
    const res = await this.fetch(`${this.baseUrl}/api/me/submission`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify({ repo_url: repoUrl, commit }),
    });
    const body = await readJson(res);
    if (res.status === 401) throw new AuthError();
    if (!res.ok) {
      const message = isApiError(body) ? `${body.error}: ${body.message ?? ""}` : `HTTP ${res.status}`;
      throw new ProtocolError(`No se registró la entrega (${message}).`, body);
    }
    return body as { repo_url: string; commit: string; registered_at?: string };
  }

  /** GET /api/me — útil para verificar el token al arrancar. */
  async me(): Promise<unknown> {
    const res = await this.fetch(`${this.baseUrl}/api/me`, { headers: this.headers });
    const body = await readJson(res);
    if (res.status === 401) throw new AuthError();
    if (!res.ok) throw new ProtocolError(`/api/me respondió ${res.status}.`, body);
    return body;
  }
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
