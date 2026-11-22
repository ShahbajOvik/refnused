import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

import * as schema from "./schema";
import type { AppDb } from "./types";

export type Database = AppDb;

/**
 * Creates a Drizzle client for MySQL 8 (mysql2 connection pool). Used by
 * the apps (src/db/index.ts), scripts (seed) and tests. Scripts must call
 * `close()` when finished.
 *
 * DATABASE_URL: mysql://user:password@host:3306/database. For a managed
 * database that needs TLS, add ?ssl={"rejectUnauthorized":true}.
 *
 * Every connection runs in UTC, so NOW() / CURRENT_TIMESTAMP match the
 * DATETIME values Drizzle writes (always UTC).
 */
export function createDatabase(
  url: string,
  options: { max?: number } = {},
): { db: AppDb; close: () => Promise<void> } {
  const pool = mysql.createPool({
    uri: url,
    connectionLimit: options.max ?? 10,
    timezone: "Z",
    supportBigNumbers: true,
    enableKeepAlive: true,
  });
  // Set the session time zone on every new connection, before it's used.
  pool.pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'");
  });
  const db = drizzle({ client: pool, schema, mode: "default", casing: "snake_case" });
  return { db: db as unknown as AppDb, close: () => pool.end() };
}
