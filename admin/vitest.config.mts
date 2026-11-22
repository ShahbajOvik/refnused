import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("../database/src/test/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    // DB tests each start an in-memory Postgres and run every migration;
    // in parallel on a busy machine that can take a while.
    hookTimeout: 180_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/app/**"],
    },
  },
});
