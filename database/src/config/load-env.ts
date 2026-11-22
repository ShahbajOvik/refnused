/**
 * Side-effect import for command-line scripts (drizzle-kit, db:seed,
 * staff:create, build:sw): loads the repo root's .env files the same way
 * the apps' next.config.ts does (see root-env.ts). Values already set in
 * the environment win, so a server's own settings take precedence.
 *
 *   node --import tsx --import @refnused/database/config/load-env script.mts
 */
import { fileURLToPath } from "node:url";

import { loadRootEnv } from "./root-env";

loadRootEnv(fileURLToPath(new URL("../../../", import.meta.url)));
