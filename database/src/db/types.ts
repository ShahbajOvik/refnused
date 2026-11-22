import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type * as schema from "./schema";

/**
 * Any Drizzle Postgres database with our schema: the app's postgres.js
 * client, or PGlite in tests. Services take this so they can be tested
 * against a real (in-memory) database.
 */
export type AppDb = PgDatabase<PgQueryResultHKT, typeof schema>;
