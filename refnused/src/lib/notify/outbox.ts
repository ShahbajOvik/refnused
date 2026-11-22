import "server-only";

import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Development/test outbox. When EMAIL_OUTBOX_DIR is set and no email
 * provider is configured, every email (including sign-in links) is also
 * written there as JSON, so automated tests can read it like an inbox.
 * Never enabled in production (src/lib/env.server.ts refuses it).
 */
export function writeToOutbox(message: { to: string; subject: string; text: string }) {
  const dir = process.env.EMAIL_OUTBOX_DIR;
  if (!dir) return;
  if (process.env.VERCEL_ENV === "production") return;
  mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}-${randomBytes(4).toString("hex")}.json`;
  writeFileSync(join(dir, name), JSON.stringify({ ...message, sentAt: new Date().toISOString() }));
}
