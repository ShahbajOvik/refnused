import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/*
 * drizzle-kit (0.31) writes MySQL indexes that mix columns with an
 * expression wrongly: it wraps the expression's pieces in backticks, e.g.
 * `(coalesce(`storage_gb``,` -1))`. `npm run db:generate` repairs it
 * (scripts/fix-mysql-migrations.mts); this test catches a migration
 * generated any other way.
 */
describe("migrations", () => {
  const dir = fileURLToPath(new URL("../../drizzle", import.meta.url));
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
    it(`${file} has no mangled functional index expressions`, () => {
      const sql = readFileSync(`${dir}/${file}`, "utf8");
      expect(sql).not.toMatch(/``|[,(]`\(/);
    });
  }
});
