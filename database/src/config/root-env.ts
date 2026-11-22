import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

/**
 * Loads the repo root's .env files into process.env, for next.config.ts in
 * both apps. One .env.local at the root is shared by the website, the admin
 * and the database scripts.
 *
 * Next.js only reads .env files in the app's own folder, and @next/env's
 * loadEnvConfig() can't be called a second time for another folder (it
 * returns its cached first load), so this reads them itself, with Next's
 * order: .env.<mode>.local, .env.local (not in test), .env.<mode>, .env.
 * Values that are already set (the shell, Vercel, CI) and earlier files win.
 */
export function loadRootEnv(rootDir: string, mode = process.env.NODE_ENV ?? "development") {
  const files = [
    `.env.${mode}.local`,
    ...(mode === "test" ? [] : [".env.local"]),
    `.env.${mode}`,
    ".env",
  ];
  for (const file of files) {
    const path = join(rootDir, file);
    if (!existsSync(path)) continue;
    const values = parseEnv(readFileSync(path, "utf8"));
    for (const [key, value] of Object.entries(values)) {
      if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
    }
  }
}
