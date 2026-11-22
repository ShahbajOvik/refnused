/**
 * Builds a migrated, seeded PGlite snapshot for e2e tests and CI builds.
 *
 *   npm run db:test-snapshot
 *   DATABASE_URL=pglite://.test-db/snapshot.tar.gz npm run build
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "@/db/schema";
import { seed } from "@/db/seed";
import { seedDemoAccounts } from "@/db/seed/demo";
import { createFieldCipher, parseKeyring } from "@/lib/crypto/field-encryption";
import type { AppDb } from "@/db/types";

const client = new PGlite();
const db = drizzle({ client, schema, casing: "snake_case" });
await migrate(db, { migrationsFolder: "./drizzle" });
await seed(db as unknown as AppDb);
// Demo customers for /account tests. Bank details are encrypted with the
// same key the e2e server uses (FIELD_ENCRYPTION_KEYS from playwright.config.ts).
await seedDemoAccounts(
  db as unknown as AppDb,
  createFieldCipher(
    parseKeyring(
      process.env.FIELD_ENCRYPTION_KEYS ?? "k1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    ),
  ),
);
const dump = await client.dumpDataDir("gzip");
// At the repo root, so every app and the e2e tests share one snapshot.
const dir = fileURLToPath(new URL("../../.test-db/", import.meta.url));
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}snapshot.tar.gz`, Buffer.from(await dump.arrayBuffer()));
await client.close();
console.log("Wrote .test-db/snapshot.tar.gz");
