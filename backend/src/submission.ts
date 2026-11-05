// Ayudas puras para registrar la entrega (npm run submit). Sin I/O: se prueban sin git ni red.

/**
 * Convierte la URL del remoto de git en la URL pública que pide el árbitro.
 *   git@github.com:Claudia-98/ocho-por-siete.git → https://github.com/Claudia-98/ocho-por-siete
 */
export function publicRepoUrl(remote: string): string {
  let url = remote.trim();
  const ssh = url.match(/^git@(github\.com|bitbucket\.org):(.+)$/);
  if (ssh) url = `https://${ssh[1]}/${ssh[2]}`;
  url = url.replace(/^ssh:\/\/git@/, "https://").replace(/^http:\/\//, "https://");
  url = url.replace(/^https:\/\/[^@/]+@/, "https://"); // quita usuario o token incrustado
  return url.replace(/\.git$/, "").replace(/\/+$/, "");
}

/** Mismas reglas que el OpenAPI v1.0.1 para `repo_url` y `commit`. */
export function validateSubmission(repoUrl: string, commit: string): string[] {
  const problems: string[] = [];
  if (!/^https?:\/\/(github\.com|bitbucket\.org)\/.+/.test(repoUrl)) problems.push(`repo_url no es de GitHub ni de Bitbucket: ${repoUrl}`);
  if (!/^[0-9a-fA-F]{7,40}$/.test(commit)) problems.push(`commit no es un hash de 7 a 40 caracteres hexadecimales: ${commit}`);
  return problems;
}

export interface GitSnapshot {
  head: string;
  /** Hash de origin/main (o null si no se pudo leer). */
  remoteHead: string | null;
  /** Salida de `git status --porcelain`. */
  dirty: string;
}

/** Avisos antes de registrar: lo que está después del commit registrado no se evalúa. */
export function submissionWarnings(git: GitSnapshot): string[] {
  const warnings: string[] = [];
  if (git.dirty.trim() !== "") warnings.push("Hay cambios sin commit: no van a contar. Haz commit y push antes de registrar.");
  if (git.remoteHead === null) warnings.push("No se pudo leer origin/main: confirma que hiciste push.");
  else if (git.remoteHead !== git.head) warnings.push("Tu último commit no coincide con origin/main: haz git pull / git push antes de registrar.");
  return warnings;
}
