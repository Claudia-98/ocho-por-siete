import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // main.ts lee variables de entorno y abre el puerto; http.ts se prueba con partidas reales contra el mock.
      exclude: ["src/main.ts", "src/http.ts", "src/types.ts"],
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
    },
  },
});
