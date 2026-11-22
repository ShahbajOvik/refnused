import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
/** The website (default baseURL). */
export const SITE_URL = baseURL;

/*
 * Payments in e2e tests. By default there are no Stripe keys: checkout uses
 * the stand-in gateway and the tests play Stripe by sending signed webhooks.
 * To test against Stripe test mode (the real Payment Element), set
 * E2E_STRIPE_SECRET_KEY=sk_test_… and E2E_STRIPE_PUBLISHABLE_KEY=pk_test_….
 */
const stripeSecretKey = process.env.E2E_STRIPE_SECRET_KEY ?? "";
if (stripeSecretKey && !stripeSecretKey.startsWith("sk_test_")) {
  throw new Error("E2E tests only run against Stripe test mode (sk_test_…)");
}
export const E2E_OUTBOX_DIR = `${process.cwd()}/.test-db/outbox`;
export const E2E_WEBHOOK_SECRET =
  process.env.E2E_STRIPE_WEBHOOK_SECRET ?? "whsec_e2e_test_secret_not_real";

const DB_PORT = Number(process.env.E2E_DB_PORT ?? 3399);
const ADMIN_PORT = Number(process.env.ADMIN_PORT ?? 3200);
export const ADMIN_URL = `http://localhost:${ADMIN_PORT}`;

// Test values: no real email, SMS or bot-check providers are called.
const appEnv = {
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? `mysql://root@127.0.0.1:${DB_PORT}/refnused_e2e`,
  AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-secret-e2e-secret-e2e-secret-e2e",
  FIELD_ENCRYPTION_KEYS:
    process.env.FIELD_ENCRYPTION_KEYS ?? "k1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  NEXT_PUBLIC_SITE_URL: baseURL,
  NEXT_PUBLIC_ADMIN_URL: ADMIN_URL,
  // Admin → website cache refresh (test value).
  REVALIDATE_SECRET: "e2e-revalidate-secret-e2e-revalidate-secret",
  STRIPE_SECRET_KEY: stripeSecretKey,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.E2E_STRIPE_PUBLISHABLE_KEY ?? "",
  STRIPE_WEBHOOK_SECRET: E2E_WEBHOOK_SECRET,
  // Emails (sign-in links, codes) are written here for the tests to read.
  EMAIL_OUTBOX_DIR: E2E_OUTBOX_DIR,
  // Web Push test keys (public test values, never used anywhere else).
  // No real subscription is made in tests, so nothing is sent.
  NEXT_PUBLIC_VAPID_PUBLIC_KEY:
    "BIOrOi2v71DHw8zEMy7g6LD3fHO6rBuhqrEeEMwZDnFgCiXN86ihUnvyHI5463fL3v2EniicaONrZZs-2w_mlnc",
  VAPID_PRIVATE_KEY: "i88ChqDV4d8vBihv_pkhl_YrXghhWbBBPURmNS7Ft2I",
};

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
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /(checkout|account|admin)\.spec\.ts/,
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
      testIgnore: /(checkout|account|admin)\.spec\.ts/,
    },
    // Purchases sell units and account tests change demo customers, so they
    // run after everything that counts stock.
    {
      name: "checkout",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /(checkout|account)\.spec\.ts/,
      dependencies: ["desktop-chromium", "mobile-chromium"],
    },
    // The admin app (its own server); some tests also check the website.
    {
      name: "admin",
      use: { ...devices["Desktop Chrome"], baseURL: ADMIN_URL },
      testMatch: /admin\.spec\.ts/,
      dependencies: ["checkout"],
    },
  ],
  webServer: [
    {
      // A real MySQL 8 shared by both apps (mysql-memory-server), migrated
      // and seeded, so admin changes show up on the website as in production.
      command: `npm run db:e2e-server -w @refnused/database -- ${DB_PORT}`,
      wait: { stdout: /E2E database ready/ },
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
    {
      // Test against production builds so results reflect what ships.
      command: `node e2e/support/wait-for-db.mjs && npm run build -w refnused && npm run start -w refnused -- --port ${PORT}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 600_000,
      env: appEnv,
    },
    {
      command: `node e2e/support/wait-for-db.mjs && npm run build -w admin && npm run start -w admin -- --port ${ADMIN_PORT}`,
      url: `${ADMIN_URL}/admin/sign-in`,
      reuseExistingServer: !process.env.CI,
      timeout: 600_000,
      env: appEnv,
    },
  ],
});
