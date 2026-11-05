import { defineConfig } from "vitest/config";

const MIN_COVERAGE = { lines: 70, functions: 70, branches: 70, statements: 70 };

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Puntos de entrada (leen process.env y abren conexiones): no se prueban con unit tests.
      exclude: ["src/bot.ts", "src/web-api.ts", "src/submit.ts"],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage",
      // AGENTS.md: cobertura mínima de 70 % en reglas y algoritmo. Si baja, `npm test` falla.
      thresholds: {
        "src/rules/**": MIN_COVERAGE,
        "src/engine/**": MIN_COVERAGE,
      },
    },
  },
});
