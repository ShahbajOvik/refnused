import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/types";
import { and, eq, gt } from "drizzle-orm";

import { canEnrolFactor, completeStaffMfa, recordMfaFailure } from "@/auth/staff-service";
import { evaluateStaffSession, type StaffSessionRecord } from "@/auth/staff-session";
import { staffPasskeys, staffSessions } from "@refnused/database/db/schema";
import type { AppDb } from "@refnused/database/db/types";
import { recordAudit, type RequestMeta } from "@refnused/database/lib/audit";

/** Relying party: who the passkey belongs to. Derived from the site URL. */
export type RelyingParty = { name: string; id: string; origin: string };

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

async function storeChallenge(db: AppDb, sessionToken: string, challenge: string, now: Date) {
  await db
    .update(staffSessions)
    .set({
      webauthnChallenge: challenge,
      webauthnChallengeExpiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
    })
    .where(eq(staffSessions.sessionToken, sessionToken));
}

/** Reads and clears the pending challenge, so each one can be used once. */
async function consumeChallenge(db: AppDb, sessionToken: string, now: Date) {
  const [row] = await db
    .select({ challenge: staffSessions.webauthnChallenge })
    .from(staffSessions)
    .where(
      and(
        eq(staffSessions.sessionToken, sessionToken),
        gt(staffSessions.webauthnChallengeExpiresAt, now),
      ),
    );
  await db
    .update(staffSessions)
    .set({ webauthnChallenge: null, webauthnChallengeExpiresAt: null })
    .where(eq(staffSessions.sessionToken, sessionToken));
  return row?.challenge ?? null;
}

export async function listStaffPasskeys(db: AppDb, staffId: string) {
  return db
    .select({
      id: staffPasskeys.id,
      name: staffPasskeys.name,
      createdAt: staffPasskeys.createdAt,
      lastUsedAt: staffPasskeys.lastUsedAt,
      credentialId: staffPasskeys.credentialId,
      transports: staffPasskeys.transports,
    })
    .from(staffPasskeys)
    .where(eq(staffPasskeys.staffId, staffId));
}

// Registration -----------------------------------------------------------------

export async function passkeyRegistrationOptions(
  db: AppDb,
  input: { record: StaffSessionRecord; rp: RelyingParty; now?: Date },
) {
  const { record, rp } = input;
  const now = input.now ?? new Date();
  if (!canEnrolFactor(record, now)) return null;

  const existing = await listStaffPasskeys(db, record.staff.id);
  const options = await generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userID: record.staff.id,
    userName: record.staff.email,
    userDisplayName: record.staff.name,
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({
      id: isoBase64URL.toBuffer(p.credentialId),
      type: "public-key" as const,
      transports: (p.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined,
    })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  await storeChallenge(db, record.sessionToken, options.challenge, now);
  return options;
}

export async function verifyPasskeyRegistration(
  db: AppDb,
  input: {
    record: StaffSessionRecord;
    response: RegistrationResponseJSON;
    name: string;
    rp: RelyingParty;
    now?: Date;
    meta?: RequestMeta;
  },
) {
  const { record, response, rp, meta = {} } = input;
  const now = input.now ?? new Date();
  if (!canEnrolFactor(record, now)) return { ok: false, reason: "not_allowed" } as const;

  const expectedChallenge = await consumeChallenge(db, record.sessionToken, now);
  if (!expectedChallenge) return { ok: false, reason: "expired" } as const;

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: true,
    });
  } catch {
    return { ok: false, reason: "invalid" } as const;
  }
  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, reason: "invalid" } as const;
  }

  const info = verification.registrationInfo;
  await db.insert(staffPasskeys).values({
    staffId: record.staff.id,
    credentialId: isoBase64URL.fromBuffer(info.credentialID),
    publicKey: isoBase64URL.fromBuffer(info.credentialPublicKey),
    counter: info.counter,
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
    transports: response.response.transports ?? null,
    name: input.name.trim().slice(0, 60) || "Passkey",
  });
  await recordAudit(
    db,
    {
      actorType: "staff",
      actorId: record.staff.id,
      action: "staff.mfa_enrolled",
      entityType: "staff_user",
      entityId: record.staff.id,
      changes: { after: { method: "passkey" } },
    },
    meta,
  );

  if (record.mfaVerifiedAt) return { ok: true, session: null } as const;
  const session = await completeStaffMfa(db, {
    sessionToken: record.sessionToken,
    method: "passkey",
    now,
  });
  return { ok: true, session } as const;
}

// Authentication (second factor) ----------------------------------------------

export async function passkeyAuthenticationOptions(
  db: AppDb,
  input: { record: StaffSessionRecord; rp: RelyingParty; now?: Date },
) {
  const { record, rp } = input;
  const now = input.now ?? new Date();
  if (evaluateStaffSession(record, now) !== "mfa_required") return null;

  const passkeys = await listStaffPasskeys(db, record.staff.id);
  if (passkeys.length === 0) return null;

  const options = await generateAuthenticationOptions({
    rpID: rp.id,
    userVerification: "required",
    allowCredentials: passkeys.map((p) => ({
      id: isoBase64URL.toBuffer(p.credentialId),
      type: "public-key" as const,
      transports: (p.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined,
    })),
  });
  await storeChallenge(db, record.sessionToken, options.challenge, now);
  return options;
}

export async function verifyPasskeyAuthentication(
  db: AppDb,
  input: {
    record: StaffSessionRecord;
    response: AuthenticationResponseJSON;
    rp: RelyingParty;
    now?: Date;
    meta?: RequestMeta;
  },
) {
  const { record, response, rp, meta = {} } = input;
  const now = input.now ?? new Date();
  if (evaluateStaffSession(record, now) !== "mfa_required") {
    return { ok: false, reason: "not_allowed" } as const;
  }

  const expectedChallenge = await consumeChallenge(db, record.sessionToken, now);
  if (!expectedChallenge) return { ok: false, reason: "expired" } as const;

  // Only this staff member's own passkeys count.
  const [passkey] = await db
    .select()
    .from(staffPasskeys)
    .where(
      and(eq(staffPasskeys.credentialId, response.id), eq(staffPasskeys.staffId, record.staff.id)),
    );
  if (!passkey) return recordMfaFailure(db, record, "passkey", meta);

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: true,
      authenticator: {
        credentialID: isoBase64URL.toBuffer(passkey.credentialId),
        credentialPublicKey: isoBase64URL.toBuffer(passkey.publicKey),
        counter: passkey.counter,
        transports: (passkey.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined,
      },
    });
  } catch {
    return recordMfaFailure(db, record, "passkey", meta);
  }
  if (!verification.verified) return recordMfaFailure(db, record, "passkey", meta);

  await db
    .update(staffPasskeys)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: now })
    .where(eq(staffPasskeys.id, passkey.id));

  const session = await completeStaffMfa(db, {
    sessionToken: record.sessionToken,
    method: "passkey",
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
      changes: { after: { method: "passkey", passkeyId: passkey.id } },
    },
    meta,
  );
  return { ok: true, session } as const;
}
