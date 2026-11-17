import { readFileSync } from "node:fs";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";
import type { AppDb } from "./types";

export type Database = AppDb;

/**
 * Creates a Drizzle client. Used by the app (src/db/index.ts) and by
 * scripts (seed). Scripts must call `close()` when finished.
 *
 * DATABASE_URL may also be `pglite://<path to snapshot.tar.gz>` for tests
 * and CI builds: an in-process Postgres loaded from a seeded snapshot
 * (`npm run db:test-snapshot`). Never use that in production.
 */
export function createDatabase(
  url: string,
  options: { max?: number } = {},
): { db: AppDb; close: () => Promise<void> } {
  if (url.startsWith("pglite://")) return createPgliteDatabase(url.slice("pglite://".length));

  const client = postgres(url, {
    max: options.max ?? 10,
    // Required for transaction-mode poolers (Neon, Supabase, PgBouncer).
    prepare: false,
  });
  const db = drizzle(client, { schema, casing: "snake_case" });
  return { db: db as unknown as AppDb, close: () => client.end({ timeout: 5 }) };
}

function createPgliteDatabase(snapshotPath: string) {
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("pglite:// databases are for tests only");
  }
  // Loaded at runtime with a computed name so bundlers and file tracing
  // never pull PGlite (a dev dependency) into production builds.
  const load = process.getBuiltinModule("node:module").createRequire(`${process.cwd()}/`);
  const { PGlite } = load(
    ["@electric-sql", "pglite"].join("/"),
  ) as typeof import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = load(
    ["drizzle-orm", "pglite"].join("/"),
  ) as typeof import("drizzle-orm/pglite");

  const client = new PGlite({ loadDataDir: new Blob([readFileSync(snapshotPath)]) });
  const db = drizzlePglite({ client, schema, casing: "snake_case" });
  return { db: db as unknown as AppDb, close: () => client.close() };
}
