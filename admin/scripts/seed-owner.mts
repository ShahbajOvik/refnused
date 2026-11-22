/**
 * Seeds the first owner account from the environment (.env.local at the
 * repo root, or real environment variables):
 *
 *   OWNER_EMAIL=you@yourdomain.co.uk
 *   OWNER_NAME="Your Name"
 *   OWNER_PASSWORD=…        (optional, at least 12 characters)
 *
 *   npm run db:seed:owner
 *
 * Safe to re-run: an existing account is left unchanged, and a password is
 * only set when the account has none. Remove OWNER_PASSWORD from the file
 * once you've signed in. Without it, set one with `npm run staff:set-password`.
 */
import { PASSWORD_MIN_LENGTH } from "@refnused/database/auth/password";
import { createDatabase } from "@refnused/database/db/client";

import { seedOwner } from "@/auth/seed-owner";

const email = process.env.OWNER_EMAIL;
const name = process.env.OWNER_NAME;
const password = process.env.OWNER_PASSWORD || undefined;

if (!email || !name) {
  console.error(
    "Set OWNER_EMAIL and OWNER_NAME (and optionally OWNER_PASSWORD) in .env.local, then run npm run db:seed:owner.",
  );
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const { db, close } = createDatabase(process.env.DATABASE_URL, { max: 1 });
try {
  const result = await seedOwner(db, { email, name, password });
  console.log(
    result.created ? `Created owner ${email}.` : `${email} already exists: left unchanged.`,
  );
  if (result.notOwner) {
    console.warn("Note: that account isn't an active owner. Change it in /admin/staff.");
  }
  if (result.passwordSet) {
    console.log("Password set. Remove OWNER_PASSWORD from your env file now.");
  } else if (!result.hasPassword) {
    console.log(`No password given: run npm run staff:set-password -- --email ${email}`);
  }
  console.log("Sign in at /admin/sign-in, then set up two-step verification.");
} catch (error) {
  if (error instanceof Error && error.name === "ZodError") {
    console.error(
      `Invalid OWNER_* values: check the email, and use a password of at least ${PASSWORD_MIN_LENGTH} characters.`,
    );
  } else {
    console.error(error);
  }
  process.exitCode = 1;
} finally {
  await close();
}
