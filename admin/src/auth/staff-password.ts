import { randomBytes } from "node:crypto";

import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";

import {
  hashPassword,
  newPasswordSchema,
  PASSWORD_MAX_LENGTH,
  verifyPassword,
} from "@refnused/database/auth/password";
import { logSignIn } from "@/auth/sign-in-rules";
import { STAFF_SESSION_MAX_AGE_SECONDS } from "@/auth/staff-session";
import { staffSessions, staffUsers } from "@refnused/database/db/schema";
import type { AppDb } from "@refnused/database/db/types";
import { ActionError } from "@refnused/database/lib/action-error";
import { recordAudit, type RequestMeta } from "@refnused/database/lib/audit";
import { consumeRateLimit, rateLimitKey } from "@refnused/database/lib/security/rate-limit";

/*
 * Password sign-in for staff. The session created here is fully signed in
 * (there is no second step); the proxy and requireStaff() still check the
 * idle timeout, the account and the role on every request.
 *
 * Auth.js can't issue database sessions from its Credentials provider, so
 * this creates the same staff_sessions row its other providers create.
 */

const WINDOW_SECONDS = 15 * 60;
export const PASSWORD_ATTEMPTS_PER_EMAIL = 5;
export const PASSWORD_ATTEMPTS_PER_IP = 20;
export const PASSWORD_CHANGE_ATTEMPTS = 5;

export class StaffPasswordError extends ActionError {
  override name = "StaffPasswordError";
}

export const passwordSignInSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  // Length is capped so a huge value can't be used to waste CPU on hashing.
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().max(PASSWORD_MAX_LENGTH),
    newPassword: newPasswordSchema,
    confirmPassword: z.string().max(PASSWORD_MAX_LENGTH),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords don’t match",
  });

export type PasswordSignInResult =
  | { ok: true; session: { sessionToken: string; expires: Date } }
  | { ok: false; reason: "invalid" | "rate_limited" };

export async function signInStaffWithPassword(
  db: AppDb,
  input: {
    email: string;
    password: string;
    /** Keys the rate-limit counters (AUTH_SECRET in the app). */
    secret: string;
    meta?: RequestMeta;
    now?: Date;
  },
): Promise<PasswordSignInResult> {
  const { password, secret, meta = {} } = input;
  const email = input.email.trim().toLowerCase();
  const now = input.now ?? new Date();

  // Both counters always count, so one can't be used to dodge the other.
  const [byEmail, byIp] = await Promise.all([
    consumeRateLimit(db, {
      key: rateLimitKey("staff-password:email", email, secret),
      limit: PASSWORD_ATTEMPTS_PER_EMAIL,
      windowSeconds: WINDOW_SECONDS,
      now,
    }),
    consumeRateLimit(db, {
      key: rateLimitKey("staff-password:ip", meta.ipAddress ?? "unknown", secret),
      limit: PASSWORD_ATTEMPTS_PER_IP,
      windowSeconds: WINDOW_SECONDS,
      now,
    }),
  ]);
  if (!byEmail.allowed || !byIp.allowed) return { ok: false, reason: "rate_limited" };

  const [staff] = await db
    .select({
      id: staffUsers.id,
      isActive: staffUsers.isActive,
      passwordHash: staffUsers.passwordHash,
    })
    .from(staffUsers)
    .where(sql`lower(${staffUsers.email}) = ${email}`)
    .limit(1);

  // Do the same work when there is no usable account, so response time
  // doesn't reveal who works here.
  const matches = staff?.passwordHash
    ? await verifyPassword(password, staff.passwordHash)
    : (await hashPassword(password), false);

  if (!staff?.isActive || !matches) {
    await recordAudit(
      db,
      {
        actorType: "system",
        action: "auth.sign_in_denied",
        entityType: "staff_user",
        entityId: "unknown",
        changes: {
          after: { area: "staff", provider: "password", reason: "invalid_credentials", email },
        },
      },
      meta,
    );
    return { ok: false, reason: "invalid" };
  }

  const session = {
    sessionToken: randomBytes(32).toString("hex"),
    expires: new Date(now.getTime() + STAFF_SESSION_MAX_AGE_SECONDS * 1000),
  };
  await db.insert(staffSessions).values({
    ...session,
    userId: staff.id,
    createdAt: now,
    lastActiveAt: now,
  });
  await logSignIn(db, { area: "staff", userId: staff.id, provider: "password", meta });
  return { ok: true, session };
}

/** Stores a new hash, ends the person's other sessions and audits the change. */
async function writeStaffPassword(
  db: AppDb,
  input: {
    staffId: string;
    password: string;
    actor: { type: "staff" | "system"; id?: string };
    keepSessionToken?: string;
    meta?: RequestMeta;
  },
) {
  const passwordHash = await hashPassword(input.password);
  await db.transaction(async (tx) => {
    await tx
      .update(staffUsers)
      .set({ passwordHash, passwordChangedAt: new Date() })
      .where(eq(staffUsers.id, input.staffId));
    await tx
      .delete(staffSessions)
      .where(
        input.keepSessionToken
          ? and(
              eq(staffSessions.userId, input.staffId),
              ne(staffSessions.sessionToken, input.keepSessionToken),
            )
          : eq(staffSessions.userId, input.staffId),
      );
    await recordAudit(
      tx as unknown as AppDb,
      {
        actorType: input.actor.type,
        actorId: input.actor.id ?? null,
        action: "staff.password_set",
        entityType: "staff_user",
        entityId: input.staffId,
      },
      input.meta,
    );
  });
}

export async function staffHasPassword(db: AppDb, staffId: string) {
  const [staff] = await db
    .select({ hasPassword: sql<boolean>`${staffUsers.passwordHash} is not null`.mapWith(Boolean) })
    .from(staffUsers)
    .where(eq(staffUsers.id, staffId));
  return staff?.hasPassword === true;
}

/**
 * A fully signed-in staff member sets or changes their own password. The
 * current password is required once one exists.
 */
export async function changeOwnStaffPassword(
  db: AppDb,
  input: {
    staffId: string;
    currentPassword: string;
    newPassword: string;
    sessionToken: string;
    secret: string;
    meta?: RequestMeta;
  },
) {
  const [staff] = await db
    .select({ passwordHash: staffUsers.passwordHash })
    .from(staffUsers)
    .where(eq(staffUsers.id, input.staffId));
  if (!staff) throw new StaffPasswordError("Staff member not found");

  if (staff.passwordHash) {
    const attempt = await consumeRateLimit(db, {
      key: rateLimitKey("staff-password:change", input.staffId, input.secret),
      limit: PASSWORD_CHANGE_ATTEMPTS,
      windowSeconds: WINDOW_SECONDS,
    });
    if (!attempt.allowed) {
      throw new StaffPasswordError("Too many attempts. Please wait a few minutes and try again.");
    }
    if (!(await verifyPassword(input.currentPassword, staff.passwordHash))) {
      throw new StaffPasswordError("Your current password isn’t right.");
    }
  }

  await writeStaffPassword(db, {
    staffId: input.staffId,
    password: input.newPassword,
    actor: { type: "staff", id: input.staffId },
    keepSessionToken: input.sessionToken,
    meta: input.meta,
  });
}

/** For `npm run staff:set-password`: sets a password from the server's command line. */
export async function setStaffPasswordByEmail(
  db: AppDb,
  input: { email: string; password: string },
) {
  const password = newPasswordSchema.parse(input.password);
  const [staff] = await db
    .select({ id: staffUsers.id })
    .from(staffUsers)
    .where(sql`lower(${staffUsers.email}) = ${input.email.trim().toLowerCase()}`)
    .limit(1);
  if (!staff) throw new StaffPasswordError("No staff account has that email");
  await writeStaffPassword(db, { staffId: staff.id, password, actor: { type: "system" } });
  return staff;
}
