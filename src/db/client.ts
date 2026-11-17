import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type Database = ReturnType<typeof createDatabase>["db"];

/**
 * Creates a Drizzle client. Used by the app (src/db/index.ts) and by
 * scripts (seed). Scripts must call `close()` when finished.
 */
export function createDatabase(url: string, options: { max?: number } = {}) {
  const client = postgres(url, {
    max: options.max ?? 10,
    // Required for transaction-mode poolers (Neon, Supabase, PgBouncer).
    prepare: false,
  });
  const db = drizzle(client, { schema, casing: "snake_case" });
  return { db, close: () => client.end({ timeout: 5 }) };
}
