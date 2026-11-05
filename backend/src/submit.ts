// Entrada `npm run submit`: registra en el árbitro la URL del repo y el hash del commit actual.
// Hay que correrlo ANTES de las 9:45 (congelamiento). Se puede repetir: vale el último registro.
//   npm run submit                 → usa el commit actual (HEAD) y el remoto origin
//   npm run submit -- --commit abc1234
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { AuthError, ArbiterClient } from "./arbiter/client.js";
import { loadDotEnv, readBotConfig } from "./config.js";
import { publicRepoUrl, submissionWarnings, validateSubmission } from "./submission.js";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const tryGit = (...args: string[]) => {
  try {
    return git(...args);
  } catch {
    return null;
  }
};

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { commit: { type: "string" }, repo: { type: "string" } } });
  loadDotEnv();
  const config = readBotConfig();

  tryGit("fetch", "--quiet", "origin");
  const head = git("rev-parse", "HEAD");
  const commit = values.commit ?? head;
  const repoUrl = values.repo ?? publicRepoUrl(git("remote", "get-url", "origin"));

  const problems = validateSubmission(repoUrl, commit);
  if (problems.length) throw new Error(problems.join("\n"));
  for (const w of submissionWarnings({ head, remoteHead: tryGit("rev-parse", "origin/main"), dirty: git("status", "--porcelain") })) {
    console.log(`AVISO: ${w}`);
  }

  const client = new ArbiterClient({ baseUrl: config.arbiterUrl, token: config.token });
  console.log(`Registrando en ${config.arbiterUrl}:\n  repo   ${repoUrl}\n  commit ${commit}`);
  const record = await client.submit(repoUrl, commit);
  const me = (await client.me()) as { submission?: { commit?: string; registered_at?: string } | null };
  console.log(`Listo. El árbitro tiene registrado el commit ${me.submission?.commit ?? record.commit} (${me.submission?.registered_at ?? record.registered_at ?? "sin hora"}).`);
}

main().catch((err: unknown) => {
  console.error(err instanceof AuthError ? `ERROR: ${err.message}` : `ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
