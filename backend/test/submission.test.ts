import { describe, expect, it } from "vitest";
import { ArbiterClient, AuthError, type FetchLike } from "../src/arbiter/client.js";
import { ProtocolError } from "../src/arbiter/types.js";
import { publicRepoUrl, submissionWarnings, validateSubmission } from "../src/submission.js";

describe("publicRepoUrl", () => {
  it.each([
    ["https://github.com/Claudia-98/ocho-por-siete.git", "https://github.com/Claudia-98/ocho-por-siete"],
    ["git@github.com:Claudia-98/ocho-por-siete.git", "https://github.com/Claudia-98/ocho-por-siete"],
    ["https://usuario:ghp_token@github.com/Claudia-98/ocho-por-siete", "https://github.com/Claudia-98/ocho-por-siete"],
    ["ssh://git@bitbucket.org/equipo/repo.git", "https://bitbucket.org/equipo/repo"],
    ["https://github.com/Claudia-98/ocho-por-siete/", "https://github.com/Claudia-98/ocho-por-siete"],
  ] as Array<[string, string]>)("%s → %s", (remote, expected) => {
    expect(publicRepoUrl(remote)).toBe(expected);
  });
});

describe("validateSubmission", () => {
  it("acepta un repo de GitHub y un hash corto o completo", () => {
    expect(validateSubmission("https://github.com/a/b", "6a662f5")).toEqual([]);
    expect(validateSubmission("https://github.com/a/b", "6a662f5d0a8b7c6e5f4d3c2b1a0f9e8d7c6b5a49")).toEqual([]);
  });

  it("rechaza otros hosts y hashes inválidos", () => {
    expect(validateSubmission("https://gitlab.com/a/b", "6a662f5")).toHaveLength(1);
    expect(validateSubmission("https://github.com/a/b", "main")).toHaveLength(1);
  });
});

describe("submissionWarnings", () => {
  it("sin avisos si todo está commiteado y subido", () => {
    expect(submissionWarnings({ head: "abc1234", remoteHead: "abc1234", dirty: "" })).toEqual([]);
  });

  it("avisa de cambios sin commit y de commits sin push", () => {
    const w = submissionWarnings({ head: "abc1234", remoteHead: "0000000", dirty: " M README.md" });
    expect(w).toHaveLength(2);
    expect(submissionWarnings({ head: "abc1234", remoteHead: null, dirty: "" })).toHaveLength(1);
  });
});

describe("ArbiterClient.submit", () => {
  const client = (status: number, body: unknown, calls: Array<{ method: string; url: string; body: unknown }> = []) => {
    const fetch: FetchLike = async (url, init) => {
      calls.push({ method: init?.method ?? "GET", url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(body), { status });
    };
    return new ArbiterClient({ baseUrl: "https://arbitro.test", token: "t", fetch });
  };

  it("hace PUT /api/me/submission con repo_url y commit", async () => {
    const calls: Array<{ method: string; url: string; body: unknown }> = [];
    const res = await client(200, { repo_url: "https://github.com/a/b", commit: "abc1234", registered_at: "x" }, calls).submit("https://github.com/a/b", "abc1234");
    expect(calls).toEqual([{ method: "PUT", url: "https://arbitro.test/api/me/submission", body: { repo_url: "https://github.com/a/b", commit: "abc1234" } }]);
    expect(res.commit).toBe("abc1234");
  });

  it("423 (entregas cerradas) lanza un error con el motivo", async () => {
    let err: unknown;
    try {
      await client(423, { ok: false, error: "submissions_closed", message: "Las entregas cerraron a las 09:45." }).submit("https://github.com/a/b", "abc1234");
    } catch (e) {
      err = e;
    }
    expect(err instanceof ProtocolError && err.message.includes("submissions_closed")).toBe(true);
  });

  it("401 lanza AuthError", async () => {
    let err: unknown;
    try {
      await client(401, { ok: false, error: "unauthorized" }).submit("https://github.com/a/b", "abc1234");
    } catch (e) {
      err = e;
    }
    expect(err instanceof AuthError).toBe(true);
  });
});
