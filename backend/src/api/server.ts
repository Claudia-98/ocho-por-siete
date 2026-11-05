// Capa HTTP de la API para la web: solo traduce node:http ↔ handleApi. Toda la lógica está en handlers.ts.
import { createServer, type IncomingMessage, type Server } from "node:http";
import { handleApi, INVALID_JSON, type ApiDeps } from "./handlers.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function readBody(req: IncomingMessage): Promise<unknown> {
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

export function createApiServer(deps: ApiDeps, log: (line: string) => void = () => {}): Server {
  return createServer(async (req, res) => {
    const started = deps.now();
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      res.end();
      return;
    }
    const url = new URL(req.url ?? "/", "http://api");
    const result = await handleApi(
      { method: req.method ?? "GET", path: url.pathname.replace(/\/+$/, "") || "/", query: url.searchParams, body: await readBody(req) },
      deps,
    );
    res.writeHead(result.status, { "Content-Type": "application/json; charset=utf-8", ...CORS });
    res.end(JSON.stringify(result.body));
    log(`${req.method} ${url.pathname} → ${result.status} (${Math.round(deps.now() - started)} ms)`);
  });
}
