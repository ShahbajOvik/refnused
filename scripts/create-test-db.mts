/**
 * Builds a migrated, seeded PGlite snapshot for e2e tests and CI builds.
 *
 *   npm run db:test-snapshot
 *   DATABASE_URL=pglite://.test-db/snapshot.tar.gz npm run build
 */
import { mkdirSync, writeFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "@/db/schema";
import { seed } from "@/db/seed";
import type { AppDb } from "@/db/types";

const client = new PGlite();
const db = drizzle({ client, schema, casing: "snake_case" });
await migrate(db, { migrationsFolder: "./drizzle" });
await seed(db as unknown as AppDb);
const dump = await client.dumpDataDir("gzip");
mkdirSync(".test-db", { recursive: true });
writeFileSync(".test-db/snapshot.tar.gz", Buffer.from(await dump.arrayBuffer()));
await client.close();
console.log("Wrote .test-db/snapshot.tar.gz");
