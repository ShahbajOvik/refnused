/**
 * Seeds the database at DATABASE_URL. Run with `npm run db:seed`; add
 * `-- --demo` for the demo customers and staff (database/src/db/seed/demo.ts,
 * local and test databases only). Refuses to run against production unless ALLOW_PRODUCTION_SEED=1.
 */
import { createDatabase } from "../src/db/client";
import { seed } from "../src/db/seed";
import { seedDemoAccounts } from "../src/db/seed/demo";
import { getFieldCipher } from "../src/lib/crypto/field-encryption";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  process.exit(1);
}

const isProduction =
  process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
if (isProduction && process.env.ALLOW_PRODUCTION_SEED !== "1") {
  console.error("Refusing to seed production. Set ALLOW_PRODUCTION_SEED=1 to override.");
  process.exit(1);
}

const { db, close } = createDatabase(url, { max: 1 });
try {
  const result = await seed(db);
  console.log("Seed complete:", result);
  if (process.argv.includes("--demo")) {
    if (isProduction) throw new Error("Demo accounts are never seeded in production.");
    await seedDemoAccounts(db, getFieldCipher());
    console.log("Demo accounts seeded.");
  }
} catch (error) {
  console.error("Seed failed:", error);
  process.exitCode = 1;
} finally {
  await close();
}
