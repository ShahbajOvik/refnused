import "server-only";

import { serverEnv } from "../lib/env.server";

import { createDatabase, type Database } from "./client";

/**
 * App database client. Server-only. Reuses one connection pool across hot
 * reloads in development.
 */
const globalForDb = globalThis as unknown as { __db?: Database };

export const db: Database =
  globalForDb.__db ??
  createDatabase(serverEnv.DATABASE_URL, {
    // Serverless functions each hold their own pool; keep it small.
    max: process.env.NODE_ENV === "production" ? 5 : 10,
  }).db;

if (process.env.NODE_ENV !== "production") {
  globalForDb.__db = db;
}

export * as schema from "./schema";
