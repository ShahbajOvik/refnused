/**
 * Seeds the database at DATABASE_URL. Run with `npm run db:seed`.
 * Refuses to run against production unless ALLOW_PRODUCTION_SEED=1.
 */
import { createDatabase } from "@/db/client";
import { seed } from "@/db/seed";

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
} catch (error) {
  console.error("Seed failed:", error);
  process.exitCode = 1;
} finally {
  await close();
}
