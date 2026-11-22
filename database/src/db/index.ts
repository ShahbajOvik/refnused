import "server-only";

import { serverEnv } from "../lib/env.server";

import { createDatabase, type Database } from "./client";

/**
 * App database client. Server-only. One connection pool per process: Next.js
 * bundles pages, route handlers and actions separately, and each bundle would
 * otherwise create its own pool (and in development, one per hot reload).
 */
const globalForDb = globalThis as unknown as { __db?: Database };

export const db: Database =
  globalForDb.__db ??
  createDatabase(serverEnv.DATABASE_URL, {
    // Serverless functions each hold their own pool; keep it small.
    // DATABASE_POOL_MAX overrides it (e2e: 1, see playwright.config.ts).
    max: serverEnv.DATABASE_POOL_MAX ?? (process.env.NODE_ENV === "production" ? 5 : 10),
  }).db;

globalForDb.__db = db;

export * as schema from "./schema";
