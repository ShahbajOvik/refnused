import { eq, sql } from "drizzle-orm";

import { findStaffForSignIn } from "@/auth/staff-service";
import { customers, staffUsers } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { recordAudit, type RequestMeta } from "@/lib/audit";

/*
 * Rules applied in the Auth.js `signIn` callbacks, and the audit entries
 * for sign-in and sign-out. Kept apart from the Auth.js config so they can
 * be tested against a database.
 */

export const STAFF_CHECK_EMAIL_PATH = "/admin/sign-in/check-email";
export const STAFF_DENIED_PATH = "/admin/sign-in?error=AccessDenied";

type SignInAttempt = {
  email: string | null | undefined;
  provider: string | undefined;
  /** Google's `email_verified` claim. */
  emailVerified?: boolean;
  /** True when Auth.js is about to send a magic link (not yet clicked). */
  isVerificationRequest?: boolean;
  meta?: RequestMeta;
};

/**
 * Staff may only sign in if an owner has already created an active account
 * for their email. For unknown emails asking for a magic link we show the
 * normal "check your email" page without sending anything, so the form
 * can't be used to discover who works here.
 */
export async function checkStaffSignIn(db: AppDb, attempt: SignInAttempt): Promise<true | string> {
  const { email, provider, meta = {} } = attempt;
  const deny = async (reason: string) => {
    await recordAudit(
      db,
      {
        actorType: "system",
        action: "auth.sign_in_denied",
        entityType: "staff_user",
        entityId: "unknown",
        changes: { after: { area: "staff", provider, reason, email: email?.toLowerCase() } },
      },
      meta,
    );
    return attempt.isVerificationRequest ? STAFF_CHECK_EMAIL_PATH : STAFF_DENIED_PATH;
  };

  if (provider === "google" && attempt.emailVerified !== true) return deny("email_not_verified");
  const staff = await findStaffForSignIn(db, email);
  if (!staff) return deny("no_active_staff_account");
  return true;
}

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

export async function logSignIn(
  db: AppDb,
  input: {
    area: "customer" | "staff";
    userId: string | undefined;
    provider: string | undefined;
    isNewUser?: boolean;
    meta?: RequestMeta;
  },
) {
  if (!input.userId) return;
  const entityType = input.area === "staff" ? "staff_user" : "customer";
  await recordAudit(
    db,
    {
      actorType: input.area,
      actorId: input.userId,
      // For staff this is the first factor only; "auth.mfa_verified" follows.
      action: "auth.sign_in",
      entityType,
      entityId: input.userId,
      changes: { after: { provider: input.provider, isNewUser: input.isNewUser ?? false } },
    },
    input.meta,
  );
  if (input.area === "staff") {
    await db
      .update(staffUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(staffUsers.id, input.userId));
  }
}

export async function logSignOut(
  db: AppDb,
  input: { area: "customer" | "staff"; userId: string | undefined; meta?: RequestMeta },
) {
  if (!input.userId) return;
  await recordAudit(
    db,
    {
      actorType: input.area,
      actorId: input.userId,
      action: "auth.sign_out",
      entityType: input.area === "staff" ? "staff_user" : "customer",
      entityId: input.userId,
    },
    input.meta,
  );
}
