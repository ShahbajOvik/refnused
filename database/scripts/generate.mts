/**
 * `npm run db:generate [-- --name <name>]`: drizzle-kit generate, then the
 * MySQL index repair (scripts/fix-mysql-migrations.mts).
 */
import { execFileSync } from "node:child_process";

execFileSync("npx", ["drizzle-kit", "generate", ...process.argv.slice(2)], { stdio: "inherit" });
execFileSync(process.execPath, ["--import", "tsx", "scripts/fix-mysql-migrations.mts"], {
  stdio: "inherit",
});
