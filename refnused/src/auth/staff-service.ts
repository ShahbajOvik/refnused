import { randomBytes } from "node:crypto";

import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

import {
  STAFF_MFA_MAX_ATTEMPTS,
  evaluateStaffSession,
  type StaffSessionRecord,
} from "@/auth/staff-session";
import { generateTotpSecret, verifyTotp } from "@/auth/totp";
import { staffPasskeys, staffSessions, staffUsers } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { recordAudit, type RequestMeta } from "@/lib/audit";
import type { FieldCipher } from "@/lib/crypto/field-encryption";

/*
 * Staff authentication data access. Every function takes `db` so it runs
 * against PGlite in tests. Callers are src/auth/staff.ts (Auth.js), the
 * proxy, src/auth/guards.ts and the /admin 2FA server actions.
 */

export const TOTP_SECRET_CONTEXT = "staff_users.totp_secret";

/** Active staff member for an email, or null. Sign-in never creates staff. */
export async function findStaffForSignIn(db: AppDb, email: string | null | undefined) {
  if (!email) return null;
  const [staff] = await db
    .select({ id: staffUsers.id, email: staffUsers.email, isActive: staffUsers.isActive })
    .from(staffUsers)
    .where(sql`lower(${staffUsers.email}) = lower(${email})`)
    .limit(1);
  return staff?.isActive ? staff : null;
}

export async function loadStaffSession(
  db: AppDb,
  sessionToken: string,
): Promise<StaffSessionRecord | null> {
  const [row] = await db
    .select({
      sessionToken: staffSessions.sessionToken,
      expires: staffSessions.expires,
      createdAt: staffSessions.createdAt,
      lastActiveAt: staffSessions.lastActiveAt,
      mfaVerifiedAt: staffSessions.mfaVerifiedAt,
      mfaMethod: staffSessions.mfaMethod,
      mfaFailedAttempts: staffSessions.mfaFailedAttempts,
      staffId: staffUsers.id,
      email: staffUsers.email,
      name: staffUsers.name,
      role: staffUsers.role,
      isActive: staffUsers.isActive,
      totpEnabledAt: staffUsers.totpEnabledAt,
      passkeyCount: sql<number>`(select count(*)::int from staff_passkeys where staff_passkeys.staff_id = ${staffUsers.id})`,
    })
    .from(staffSessions)
    .innerJoin(staffUsers, eq(staffSessions.userId, staffUsers.id))
    .where(eq(staffSessions.sessionToken, sessionToken))
    .limit(1);
  if (!row) return null;

  return {
    sessionToken: row.sessionToken,
    expires: row.expires,
    createdAt: row.createdAt,
    lastActiveAt: row.lastActiveAt,
    mfaVerifiedAt: row.mfaVerifiedAt,
    mfaMethod: row.mfaMethod,
    mfaFailedAttempts: row.mfaFailedAttempts,
    staff: {
      id: row.staffId,
      email: row.email,
      name: row.name,
      role: row.role,
      isActive: row.isActive,
      hasTotp: row.totpEnabledAt !== null,
      passkeyCount: Number(row.passkeyCount),
    },
  };
}

export async function recordStaffActivity(db: AppDb, sessionToken: string, now = new Date()) {
  await db
    .update(staffSessions)
    .set({ lastActiveAt: now })
    .where(eq(staffSessions.sessionToken, sessionToken));
}

export async function deleteStaffSession(db: AppDb, sessionToken: string) {
  await db.delete(staffSessions).where(eq(staffSessions.sessionToken, sessionToken));
}

export async function deleteAllStaffSessions(db: AppDb, staffId: string) {
  await db.delete(staffSessions).where(eq(staffSessions.userId, staffId));
}

/**
 * Marks the second factor as done. Issues a new session token (and deletes
 * the old one) so a token seen before 2FA can't be reused after it.
 */
export async function completeStaffMfa(
  db: AppDb,
  input: { sessionToken: string; method: "passkey" | "totp"; now?: Date },
) {
  const now = input.now ?? new Date();
  const newToken = randomBytes(32).toString("hex");
  return db.transaction(async (tx) => {
    const [old] = await tx
      .delete(staffSessions)
      .where(eq(staffSessions.sessionToken, input.sessionToken))
      .returning();
    if (!old) throw new Error("Session not found");
    const [created] = await tx
      .insert(staffSessions)
      .values({
        sessionToken: newToken,
        userId: old.userId,
        expires: old.expires,
        createdAt: old.createdAt,
        lastActiveAt: now,
        mfaVerifiedAt: now,
        mfaMethod: input.method,
        mfaFailedAttempts: 0,
      })
      .returning({ sessionToken: staffSessions.sessionToken, expires: staffSessions.expires });
    return created!;
  });
}

export type MfaFailure =
  | { ok: false; reason: "invalid"; attemptsLeft: number }
  | { ok: false; reason: "locked" }
  | { ok: false; reason: "not_allowed" };

/** Counts a failed second-factor attempt. Destroys the session after too many. */
export async function recordMfaFailure(
  db: AppDb,
  record: StaffSessionRecord,
  method: "passkey" | "totp",
  meta: RequestMeta,
): Promise<MfaFailure> {
  const [updated] = await db
    .update(staffSessions)
    .set({ mfaFailedAttempts: sql`${staffSessions.mfaFailedAttempts} + 1` })
    .where(eq(staffSessions.sessionToken, record.sessionToken))
    .returning({ attempts: staffSessions.mfaFailedAttempts });
  const attempts = updated?.attempts ?? STAFF_MFA_MAX_ATTEMPTS;

  const base = {
    actorType: "staff" as const,
    actorId: record.staff.id,
    entityType: "staff_user",
    entityId: record.staff.id,
  };
  await recordAudit(
    db,
    { ...base, action: "auth.mfa_failed", changes: { after: { method, attempts } } },
    meta,
  );

  if (attempts >= STAFF_MFA_MAX_ATTEMPTS) {
    await deleteStaffSession(db, record.sessionToken);
    await recordAudit(
      db,
      { ...base, action: "auth.mfa_locked", changes: { after: { method } } },
      meta,
    );
    return { ok: false, reason: "locked" };
  }
  return { ok: false, reason: "invalid", attemptsLeft: STAFF_MFA_MAX_ATTEMPTS - attempts };
}

/** Second step of sign-in with an authenticator app code. */
export async function verifyStaffTotp(
  db: AppDb,
  input: {
    record: StaffSessionRecord;
    code: string;
    cipher: FieldCipher;
    now?: Date;
    meta?: RequestMeta;
  },
) {
  const { record, code, cipher, meta = {} } = input;
  const now = input.now ?? new Date();
  if (evaluateStaffSession(record, now) !== "mfa_required" || !record.staff.hasTotp) {
    return { ok: false, reason: "not_allowed" } as const;
  }

  const [staff] = await db
    .select({ secret: staffUsers.totpSecretEncrypted, lastUsedStep: staffUsers.totpLastUsedStep })
    .from(staffUsers)
    .where(eq(staffUsers.id, record.staff.id));
  if (!staff?.secret) return { ok: false, reason: "not_allowed" } as const;

  const secret = cipher.decrypt(staff.secret, TOTP_SECRET_CONTEXT);
  const step = verifyTotp(secret, code, { at: now, lastUsedStep: staff.lastUsedStep });
  if (step === null) return recordMfaFailure(db, record, "totp", meta);

  // Claim the step atomically so the same code can't be used twice in a race.
  const claimed = await db
    .update(staffUsers)
    .set({ totpLastUsedStep: step })
    .where(
      and(
        eq(staffUsers.id, record.staff.id),
        or(isNull(staffUsers.totpLastUsedStep), lt(staffUsers.totpLastUsedStep, step)),
      ),
    )
    .returning({ id: staffUsers.id });
  if (claimed.length === 0) return recordMfaFailure(db, record, "totp", meta);

  const session = await completeStaffMfa(db, {
    sessionToken: record.sessionToken,
    method: "totp",
    now,
  });
  await recordAudit(
    db,
    {
      actorType: "staff",
      actorId: record.staff.id,
      action: "auth.mfa_verified",
      entityType: "staff_user",
      entityId: record.staff.id,
      changes: { after: { method: "totp" } },
    },
    meta,
  );
  return { ok: true, session } as const;
}

/** A staff member may add a factor if they have none yet, or are fully signed in. */
export function canEnrolFactor(record: StaffSessionRecord, now = new Date()) {
  const status = evaluateStaffSession(record, now);
  return status === "mfa_setup_required" || status === "active";
}

/** Starts (or restarts) TOTP setup. Returns the secret to show as a QR code. */
export async function startTotpSetup(
  db: AppDb,
  input: { record: StaffSessionRecord; cipher: FieldCipher },
) {
  const { record, cipher } = input;
  if (!canEnrolFactor(record) || record.staff.hasTotp) return null;
  const secret = generateTotpSecret();
  await db
    .update(staffUsers)
    .set({ totpSecretEncrypted: cipher.encrypt(secret, TOTP_SECRET_CONTEXT), totpEnabledAt: null })
    .where(eq(staffUsers.id, record.staff.id));
  return secret;
}

/** The secret for TOTP setup in progress, or null. */
export async function getPendingTotpSecret(db: AppDb, staffId: string, cipher: FieldCipher) {
  const [staff] = await db
    .select({ secret: staffUsers.totpSecretEncrypted, enabledAt: staffUsers.totpEnabledAt })
    .from(staffUsers)
    .where(eq(staffUsers.id, staffId));
  if (!staff?.secret || staff.enabledAt) return null;
  return cipher.decrypt(staff.secret, TOTP_SECRET_CONTEXT);
}

/** Confirms TOTP setup with a first code. Completes 2FA for this session too. */
export async function confirmTotpSetup(
  db: AppDb,
  input: {
    record: StaffSessionRecord;
    code: string;
    cipher: FieldCipher;
    now?: Date;
    meta?: RequestMeta;
  },
) {
  const { record, code, cipher, meta = {} } = input;
  const now = input.now ?? new Date();
  if (!canEnrolFactor(record, now) || record.staff.hasTotp) {
    return { ok: false, reason: "not_allowed" } as const;
  }
  const secret = await getPendingTotpSecret(db, record.staff.id, cipher);
  if (!secret) return { ok: false, reason: "not_allowed" } as const;

  const step = verifyTotp(secret, code, { at: now });
  if (step === null) return recordMfaFailure(db, record, "totp", meta);

  await db
    .update(staffUsers)
    .set({ totpEnabledAt: now, totpLastUsedStep: step })
    .where(eq(staffUsers.id, record.staff.id));
  await recordAudit(
    db,
    {
      actorType: "staff",
      actorId: record.staff.id,
      action: "staff.mfa_enrolled",
      entityType: "staff_user",
      entityId: record.staff.id,
      changes: { after: { method: "totp" } },
    },
    meta,
  );

  if (record.mfaVerifiedAt) return { ok: true, session: null } as const;
  const session = await completeStaffMfa(db, {
    sessionToken: record.sessionToken,
    method: "totp",
    now,
  });
  return { ok: true, session } as const;
}

/** Owner action: removes all 2FA factors and signs the person out everywhere. */
export async function resetStaffMfa(db: AppDb, staffId: string) {
  await db.transaction(async (tx) => {
    await tx
      .update(staffUsers)
      .set({ totpSecretEncrypted: null, totpEnabledAt: null, totpLastUsedStep: null })
      .where(eq(staffUsers.id, staffId));
    await tx.delete(staffPasskeys).where(eq(staffPasskeys.staffId, staffId));
    await tx.delete(staffSessions).where(eq(staffSessions.userId, staffId));
  });
}
