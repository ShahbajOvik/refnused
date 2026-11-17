import { randomBytes } from "node:crypto";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "@/db/schema";
import type { AppDb } from "@/db/types";
import { createFieldCipher, parseKeyring } from "@/lib/crypto/field-encryption";

/** A fresh in-memory Postgres with all migrations applied. */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle({ client, schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db: db as unknown as AppDb, client, close: () => client.close() };
}

export function testCipher() {
  return createFieldCipher(parseKeyring(`k1:${randomBytes(32).toString("base64")}`));
}
