// Capa HTTP del mock con node:http (sin dependencias). Traduce rutas del OpenAPI a llamadas al núcleo.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Arbiter, ArbiterError } from "./arbiter.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
};

function send(res: ServerResponse, status: number, body: unknown): void {
  if (res.writableEnded) return;
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...CORS });
  res.end(JSON.stringify(body));
}

const INVALID_JSON = Symbol("invalid-json");

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (text === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return INVALID_JSON;
  }
}

async function bodyOrFail(req: IncomingMessage): Promise<unknown> {
  const body = await readJson(req);
  // OpenAPI v1.0.1: JSON inválido → 400 validation, sin penalizar.
  if (body === INVALID_JSON) throw new ArbiterError(400, "validation", "JSON inválido.");
  return body;
}

export interface MockServerOptions {
  /** Contenido de /api/openapi.json. */
  openapi?: unknown;
}

export function createMockServer(arbiter: Arbiter, options: MockServerOptions = {}): Server {
  return createServer((req, res) => {
    handle(arbiter, options, req, res).catch((err: unknown) => {
      if (err instanceof ArbiterError) return send(res, err.status, err.body);
      console.error(err);
      send(res, 500, { ok: false, error: "internal", message: "Error interno del mock." });
    });
  });
}

async function handle(arbiter: Arbiter, options: MockServerOptions, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://mock");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method ?? "GET";
  const auth = () => arbiter.authenticate(req.headers.authorization);
  const query = (name: string) => url.searchParams.get(name) ?? undefined;

  if (method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  // ── Bot ──
  if (method === "GET" && path === "/api/next") {
    const team = auth();
    const handle = arbiter.next(team, query("wait"));
    // Si el bot cierra la conexión, no se le debe entregar un turno que nunca va a leer.
    res.on("close", () => {
      if (!res.writableEnded) handle.cancel();
    });
    return send(res, 200, await handle.promise);
  }
  if (method === "POST" && path === "/api/move") {
    const team = auth();
    const { status, body } = arbiter.move(team, await bodyOrFail(req));
    return send(res, status, body);
  }
  if (method === "POST" && path === "/api/practice") {
    const team = auth();
    return send(res, 201, arbiter.createPractice(team, await bodyOrFail(req)));
  }

  // ── Equipo ──
  if (method === "GET" && path === "/api/me") return send(res, 200, arbiter.me(auth()));
  if (method === "PUT" && path === "/api/me/submission") {
    const team = auth();
    return send(res, 200, arbiter.submit(team, await bodyOrFail(req)));
  }

  // ── Público ──
  if (method === "GET" && path === "/api/health") {
    return send(res, 200, { ok: true, phase: arbiter.phase, time: new Date().toISOString() });
  }
  if (method === "GET" && path === "/api/openapi.json") {
    if (options.openapi === undefined) throw new ArbiterError(404, "not_found", "OpenAPI no configurado.");
    return send(res, 200, options.openapi);
  }
  if (method === "GET" && path === "/api/games") return send(res, 200, arbiter.listGames(query("kind"), query("limit")));
  const gameMatch = path.match(/^\/api\/games\/([^/]+)$/);
  if (method === "GET" && gameMatch?.[1]) return send(res, 200, arbiter.getGame(decodeURIComponent(gameMatch[1])));
  if (method === "GET" && path === "/api/standings") return send(res, 200, arbiter.standings());

  // ── Solo del mock (no existen en el árbitro real) ──
  if (method === "POST" && path === "/mock/friendly") {
    const body = await bodyOrFail(req);
    const { team1, team2 } = (body ?? {}) as { team1?: unknown; team2?: unknown };
    return send(res, 201, arbiter.createFriendly(team1, team2));
  }
  if (method === "POST" && path === "/mock/phase") {
    const body = (await bodyOrFail(req)) as { phase?: unknown } | undefined;
    const phases = ["practice", "frozen", "league", "playoffs", "finished"] as const;
    const phase = phases.find((p) => p === body?.phase);
    if (!phase) throw new ArbiterError(400, "validation", `phase debe ser una de: ${phases.join(", ")}.`);
    arbiter.phase = phase;
    return send(res, 200, { ok: true, phase });
  }

  throw new ArbiterError(404, "not_found", `No existe ${method} ${path}.`);
}
