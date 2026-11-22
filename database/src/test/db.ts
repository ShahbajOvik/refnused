import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { inject } from "vitest";

import { createDatabase } from "../db/client";
import { createFieldCipher, parseKeyring } from "../lib/crypto/field-encryption";

/**
 * A fresh, empty MySQL database with every migration applied, on the
 * server started for this test run (src/test/global-setup.ts). Uses the
 * production driver (mysql2). close() drops it.
 */
export async function createTestDb() {
  const base = inject("mysqlUrl");
  const name = `t_${randomBytes(6).toString("hex")}`;
  const admin = await mysql.createConnection(base);
  await admin.query(`CREATE DATABASE \`${name}\``);
  await admin.end();
  const { db, close } = createDatabase(`${base}${name}`, { max: 5 });
  // Relative to this file, so tests in every app find the migrations.
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
  return {
    db,
    close: async () => {
      await close();
      const cleanup = await mysql.createConnection(base);
      await cleanup.query(`DROP DATABASE IF EXISTS \`${name}\``);
      await cleanup.end();
    },
  };
}

export function testCipher() {
  return createFieldCipher(parseKeyring(`k1:${randomBytes(32).toString("base64")}`));
}

// Set by src/test/global-setup.ts.
declare module "vitest" {
  export interface ProvidedContext {
    mysqlUrl: string;
  }
}
