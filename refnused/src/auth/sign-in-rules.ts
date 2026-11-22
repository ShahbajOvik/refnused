import { sql } from "drizzle-orm";

import { customers } from "@refnused/database/db/schema";
import type { AppDb } from "@refnused/database/db/types";
import type { SignInAttempt } from "@refnused/database/lib/auth/sign-in-log";

/*
 * Rules applied in the customer Auth.js `signIn` callback. Kept apart from
 * the Auth.js config so they can be tested against a database. Logging is
 * in @refnused/database/lib/auth/sign-in-log.
 */

export { logSignIn, logSignOut } from "@refnused/database/lib/auth/sign-in-log";

/** Customers can sign up freely, except erased accounts and unverified Google emails. */
export async function checkCustomerSignIn(db: AppDb, attempt: SignInAttempt): Promise<boolean> {
  if (attempt.provider === "google" && attempt.emailVerified !== true) return false;
  if (!attempt.email) return attempt.provider === "passkey";
  const [customer] = await db
    .select({ deletedAt: customers.deletedAt })
    .from(customers)
    .where(sql`lower(${customers.email}) = lower(${attempt.email})`)
    .limit(1);
  return !customer?.deletedAt;
}
