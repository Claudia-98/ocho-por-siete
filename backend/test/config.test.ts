import { describe, expect, it } from "vitest";
import { readBotConfig } from "../src/config.js";

describe("readBotConfig", () => {
  it("lee URL, token y presupuesto (1800 por defecto)", () => {
    expect(readBotConfig({ ARBITRO_URL: "http://localhost:4000", TEAM_TOKEN: "dev-eq4" })).toEqual({
      arbiterUrl: "http://localhost:4000",
      token: "dev-eq4",
      budgetMs: 1800,
    });
  });

  it("explica qué variables faltan", () => {
    let message = "";
    try {
      readBotConfig({});
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message.includes("ARBITRO_URL") && message.includes("TEAM_TOKEN")).toBe(true);
  });

  it.each(["0", "3000", "abc"])("rechaza BUDGET_MS=%s", (value) => {
    expect(() => readBotConfig({ ARBITRO_URL: "x", TEAM_TOKEN: "y", BUDGET_MS: value })).toThrow();
  });
});
