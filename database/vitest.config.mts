import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub", import.meta.url)),
    },
  },
  test: {
    // One real MySQL server for the run (createTestDb() gives each file a database).
    globalSetup: ["./src/test/global-setup.ts"],
    environment: "node",
    include: ["src/**/*.test.ts"],
    // DB tests each create a database on the test MySQL and run every migration.
    hookTimeout: 180_000,
  },
});
