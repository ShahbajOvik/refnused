import { eq } from "drizzle-orm";

import { staffUsers } from "../../db/schema";
import type { AppDb } from "../../db/types";
import { recordAudit, type RequestMeta } from "../audit";

/*
 * Audit entries for sign-in and sign-out, shared by the website (customers)
 * and the admin (staff) Auth.js callbacks.
 */

export type SignInAttempt = {
  email: string | null | undefined;
  provider: string | undefined;
  /** Google's `email_verified` claim. */
  emailVerified?: boolean;
  /** True when Auth.js is about to send a magic link (not yet clicked). */
  isVerificationRequest?: boolean;
  meta?: RequestMeta;
};

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
