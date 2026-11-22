/**
 * Waits until the e2e database is migrated and seeded (database/scripts/
 * e2e-mysql.mts writes .test-db/mysql.ready), so app builds never run
 * against a half-ready database. Used by playwright.config.ts.
 */
import { existsSync } from "node:fs";

const file = new URL("../../.test-db/mysql.ready", import.meta.url);
const deadline = Date.now() + 300_000;
while (!existsSync(file)) {
  if (Date.now() > deadline) {
    console.error("Timed out waiting for the e2e database");
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
