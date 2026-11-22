import { fileURLToPath } from "node:url";

import { defineConfig } from "drizzle-kit";

import { loadRootEnv } from "./src/config/root-env";

// drizzle-kit runs outside Next.js, so load the repo root's .env files the
// same way the apps do (.env.production.local, .env.local, .env.production,
// .env when NODE_ENV=production). Variables already set win.
loadRootEnv(fileURLToPath(new URL("../", import.meta.url)));

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Put it in .env.local (or .env / .env.production) at the repo root, " +
      "or set it in the environment, e.g. DATABASE_URL=mysql://user:password@host:3306/dbname",
  );
}

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
