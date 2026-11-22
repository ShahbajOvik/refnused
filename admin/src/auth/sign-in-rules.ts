import { findStaffForSignIn } from "@/auth/staff-service";
import type { AppDb } from "@refnused/database/db/types";
import { recordAudit } from "@refnused/database/lib/audit";
import type { SignInAttempt } from "@refnused/database/lib/auth/sign-in-log";

/*
 * Rules applied in the staff Auth.js `signIn` callback. Kept apart from the
 * Auth.js config so they can be tested against a database. Logging is in
 * @refnused/database/lib/auth/sign-in-log.
 */

export { logSignIn, logSignOut } from "@refnused/database/lib/auth/sign-in-log";

export const STAFF_CHECK_EMAIL_PATH = "/admin/sign-in/check-email";
export const STAFF_DENIED_PATH = "/admin/sign-in?error=AccessDenied";

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
