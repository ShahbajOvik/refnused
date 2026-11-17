import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    locale: "en-GB",
    timezoneId: "Europe/London",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // Test against a production build so results reflect what ships.
    command: `npm run db:test-snapshot && npm run build && npm run start -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    // Test values: no real email, SMS or bot-check providers are called.
    env: {
      // In-process Postgres loaded from a seeded snapshot (see src/db/client.ts).
      DATABASE_URL:
        process.env.E2E_DATABASE_URL ?? `pglite://${process.cwd()}/.test-db/snapshot.tar.gz`,
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-secret-e2e-secret-e2e-secret-e2e",
      FIELD_ENCRYPTION_KEYS:
        process.env.FIELD_ENCRYPTION_KEYS ?? "k1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      NEXT_PUBLIC_SITE_URL: baseURL,
    },
  },
});
