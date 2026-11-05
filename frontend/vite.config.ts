/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // La API del backend (npm run api). Así el navegador habla con un solo origen y no hay CORS.
    proxy: { "/api": "http://localhost:3001" },
  },
  preview: {
    port: 5173,
    proxy: { "/api": "http://localhost:3001" },
  },
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    // Los componentes se prueban renderizando a HTML (react-dom/server): no hace falta un DOM simulado.
    environment: "node",
    css: { modules: { classNameStrategy: "non-scoped" } },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/**/*.d.ts"],
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
    },
  },
});
