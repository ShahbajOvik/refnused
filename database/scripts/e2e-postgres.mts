/**
 * A real PostgreSQL server for the end-to-end tests (embedded-postgres: the
 * official binaries, no Docker or system install). The website and admin run
 * as separate processes against it, exactly as they do in production, with
 * the production driver (postgres.js).
 *
 *   npm run db:e2e-server -w @refnused/database -- [port]
 *
 * Starts an empty cluster in .test-db/postgres (recreated every run), applies
 * the migrations, seeds the catalogue and demo accounts, and prints
 * DATABASE_URL. Stops (and deletes the data) on Ctrl+C or SIGTERM.
 */
import { rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";

import * as schema from "../src/db/schema";
import { seed } from "../src/db/seed";
import { seedDemoAccounts } from "../src/db/seed/demo";
import type { AppDb } from "../src/db/types";
import { createFieldCipher, parseKeyring } from "../src/lib/crypto/field-encryption";

const port = Number(process.argv[2] ?? process.env.E2E_DB_PORT ?? 5499);
const databaseDir = fileURLToPath(new URL("../../.test-db/postgres", import.meta.url));
const DATABASE = "refnused_e2e";
/** Written once seeding is done; the e2e app servers wait for it. */
const readyFile = fileURLToPath(new URL("../../.test-db/postgres.ready", import.meta.url));

rmSync(readyFile, { force: true });
rmSync(databaseDir, { recursive: true, force: true });
const pg = new EmbeddedPostgres({
  databaseDir,
  port,
  user: "postgres",
  password: "postgres",
  persistent: false,
  onLog: () => {},
});
await pg.initialise();
await pg.start();
await pg.createDatabase(DATABASE);

const url = `postgres://postgres:postgres@127.0.0.1:${port}/${DATABASE}`;
const client = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema, casing: "snake_case" });
await migrate(db, {
  migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
});
await seed(db as unknown as AppDb);
// Demo customers and staff. Bank details are encrypted with the key the e2e
// apps use (FIELD_ENCRYPTION_KEYS from playwright.config.ts).
await seedDemoAccounts(
  db as unknown as AppDb,
  createFieldCipher(
    parseKeyring(
      process.env.FIELD_ENCRYPTION_KEYS ?? "k1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    ),
  ),
);
await client.end();
writeFileSync(readyFile, url);
console.log(`E2E database ready: ${url}`);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  rmSync(readyFile, { force: true });
  await pg.stop().catch(() => undefined);
  rmSync(databaseDir, { recursive: true, force: true });
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
