/**
 * A real MySQL 8 server for the end-to-end tests (mysql-memory-server: the
 * official binaries, downloaded once and cached; no Docker or system
 * install). The website and admin run as separate processes against it, as
 * in production, with the production driver (mysql2).
 *
 *   npm run db:e2e-server -w @refnused/database -- [port]
 *
 * Applies the migrations, seeds the catalogue and demo accounts, writes
 * .test-db/mysql.ready and prints the DATABASE_URL. The data is thrown away
 * when the server stops (Ctrl+C or SIGTERM).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/mysql2/migrator";
import { createDB } from "mysql-memory-server";

import { createDatabase } from "../src/db/client";
import { seed } from "../src/db/seed";
import { seedDemoAccounts } from "../src/db/seed/demo";
import { createFieldCipher, parseKeyring } from "../src/lib/crypto/field-encryption";

const port = Number(process.argv[2] ?? process.env.E2E_DB_PORT ?? 3399);
const DATABASE = "refnused_e2e";
const testDbDir = fileURLToPath(new URL("../../.test-db/", import.meta.url));
/** Written once seeding is done; the e2e app servers wait for it. */
const readyFile = `${testDbDir}mysql.ready`;

mkdirSync(testDbDir, { recursive: true });
rmSync(readyFile, { force: true });

const server = await createDB({
  version: process.env.TEST_MYSQL_VERSION ?? "8.0.x",
  port,
  dbName: DATABASE,
  username: "root",
  logLevel: "ERROR",
  downloadBinaryOnce: true,
});

const url = `mysql://root@127.0.0.1:${server.port}/${DATABASE}`;
const { db, close } = createDatabase(url, { max: 1 });
await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
await seed(db);
// Demo customers and staff. Bank details are encrypted with the key the e2e
// apps use (FIELD_ENCRYPTION_KEYS from playwright.config.ts).
await seedDemoAccounts(
  db,
  createFieldCipher(
    parseKeyring(
      process.env.FIELD_ENCRYPTION_KEYS ?? "k1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    ),
  ),
);
await close();
writeFileSync(readyFile, url);
console.log(`E2E database ready: ${url}`);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  rmSync(readyFile, { force: true });
  await server.stop().catch(() => undefined);
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
