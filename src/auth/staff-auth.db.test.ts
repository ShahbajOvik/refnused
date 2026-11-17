// @vitest-environment node
import { randomBytes } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  checkCustomerSignIn,
  checkStaffSignIn,
  logSignIn,
  STAFF_CHECK_EMAIL_PATH,
  STAFF_DENIED_PATH,
} from "@/auth/sign-in-rules";
import { changeStaffRole, createStaff, setStaffActive } from "@/auth/staff-admin";
import {
  confirmTotpSetup,
  findStaffForSignIn,
  loadStaffSession,
  startTotpSetup,
  TOTP_SECRET_CONTEXT,
  verifyStaffTotp,
} from "@/auth/staff-service";
import { evaluateStaffSession, STAFF_MFA_MAX_ATTEMPTS } from "@/auth/staff-session";
import { generateTotp } from "@/auth/totp";
import { auditLog, customers, staffSessions, staffUsers } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { createTestDb, testCipher } from "@/test/db";

let db: AppDb;
let close: () => Promise<void>;
const cipher = testCipher();

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 60_000);
afterAll(() => close?.());

const uniqueEmail = (name: string) => `${name}-${randomBytes(3).toString("hex")}@example.co.uk`;

async function newStaff(role: "owner" | "manager" | "staff" | "content_editor" = "staff") {
  const email = uniqueEmail(role);
  const { id } = await createStaff(db, { email, name: `Test ${role}`, role }, { type: "system" });
  return { id, email };
}

/** What Auth.js does after the first factor: insert a session row. */
async function signInFirstFactor(staffId: string, at = new Date()) {
  const sessionToken = randomBytes(16).toString("hex");
  await db.insert(staffSessions).values({
    sessionToken,
    userId: staffId,
    expires: new Date(at.getTime() + 12 * 3_600_000),
    createdAt: at,
    lastActiveAt: at,
  });
  return sessionToken;
}

async function load(token: string) {
  const record = await loadStaffSession(db, token);
  if (!record) throw new Error("session not found");
  return record;
}

async function auditActions(entityId: string) {
  const rows = await db
    .select({ action: auditLog.action })
    .from(auditLog)
    .where(eq(auditLog.entityId, entityId))
    .orderBy(desc(auditLog.id));
  return rows.map((r) => r.action);
}

/** Enrols TOTP via the real setup flow and returns the plain secret. */
async function enrolTotp(staffId: string) {
  const token = await signInFirstFactor(staffId);
  const secret = (await startTotpSetup(db, { record: await load(token), cipher }))!;
  // Use last step's code so it can't collide with the next verification.
  const result = await confirmTotpSetup(db, {
    record: await load(token),
    code: generateTotp(secret, new Date(Date.now() - 30_000)),
    cipher,
  });
  expect(result.ok).toBe(true);
  return secret;
}

describe("staff sign-in rules (first factor)", () => {
  it("allows an active staff member, case-insensitively", async () => {
    const { email } = await newStaff();
    expect(await checkStaffSignIn(db, { email: email.toUpperCase(), provider: "resend" })).toBe(
      true,
    );
  });

  it("never reveals whether an email is staff when sending a magic link", async () => {
    const unknown = uniqueEmail("nobody");
    const result = await checkStaffSignIn(db, {
      email: unknown,
      provider: "resend",
      isVerificationRequest: true,
    });
    // Same page as a real request, but no email is sent.
    expect(result).toBe(STAFF_CHECK_EMAIL_PATH);

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "auth.sign_in_denied"))
      .orderBy(desc(auditLog.id))
      .limit(1);
    expect(entry!.changes).toMatchObject({
      after: { email: unknown, reason: "no_active_staff_account" },
    });
  });

  it("denies deactivated staff", async () => {
    const owner = await newStaff("owner");
    const { id, email } = await newStaff();
    await setStaffActive(db, { actorId: owner.id, staffId: id, active: false });
    expect(await findStaffForSignIn(db, email)).toBeNull();
    expect(await checkStaffSignIn(db, { email, provider: "google", emailVerified: true })).toBe(
      STAFF_DENIED_PATH,
    );
  });

  it("denies Google accounts with unverified email", async () => {
    const { email } = await newStaff();
    expect(await checkStaffSignIn(db, { email, provider: "google", emailVerified: false })).toBe(
      STAFF_DENIED_PATH,
    );
  });

  it("logs sign-ins and records the last sign-in time", async () => {
    const { id } = await newStaff();
    await logSignIn(db, {
      area: "staff",
      userId: id,
      provider: "google",
      meta: { ipAddress: "203.0.113.5" },
    });
    expect(await auditActions(id)).toContain("auth.sign_in");
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, id), eq(auditLog.action, "auth.sign_in")));
    expect(entry).toMatchObject({ actorType: "staff", actorId: id, ipAddress: "203.0.113.5" });
    const [staff] = await db.select().from(staffUsers).where(eq(staffUsers.id, id));
    expect(staff!.lastLoginAt).not.toBeNull();
  });
});

describe("customer sign-in rules", () => {
  it("lets new and existing customers in", async () => {
    expect(await checkCustomerSignIn(db, { email: uniqueEmail("new"), provider: "resend" })).toBe(
      true,
    );
  });

  it("blocks erased (deleted) customers", async () => {
    const email = uniqueEmail("erased");
    await db.insert(customers).values({ email, deletedAt: new Date() });
    expect(await checkCustomerSignIn(db, { email, provider: "resend" })).toBe(false);
  });

  it("blocks Google accounts with unverified email", async () => {
    expect(
      await checkCustomerSignIn(db, {
        email: uniqueEmail("g"),
        provider: "google",
        emailVerified: false,
      }),
    ).toBe(false);
  });

  it("logs customer sign-ins", async () => {
    const [customer] = await db
      .insert(customers)
      .values({ email: uniqueEmail("c") })
      .returning();
    await logSignIn(db, { area: "customer", userId: customer!.id, provider: "passkey" });
    expect(await auditActions(customer!.id)).toContain("auth.sign_in");
  });
});

describe("staff 2FA", () => {
  it("forces setup when no factor is enrolled, then completes 2FA and rotates the session token", async () => {
    const { id, email } = await newStaff();
    const token = await signInFirstFactor(id);
    expect(evaluateStaffSession(await load(token))).toBe("mfa_setup_required");

    const secret = await startTotpSetup(db, { record: await load(token), cipher });
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);

    // Stored encrypted, never in clear.
    const [row] = await db.select().from(staffUsers).where(eq(staffUsers.id, id));
    expect(row!.totpSecretEncrypted).not.toContain(secret!);
    expect(cipher.decrypt(row!.totpSecretEncrypted!, TOTP_SECRET_CONTEXT)).toBe(secret);

    const wrong = await confirmTotpSetup(db, { record: await load(token), code: "000000", cipher });
    expect(wrong.ok).toBe(false);

    const result = await confirmTotpSetup(db, {
      record: await load(token),
      code: generateTotp(secret!),
      cipher,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || !result.session) throw new Error("expected a new session");

    // Old token is dead; new one is fully signed in.
    expect(await loadStaffSession(db, token)).toBeNull();
    const rotated = await load(result.session.sessionToken);
    expect(evaluateStaffSession(rotated)).toBe("active");
    expect(rotated.mfaMethod).toBe("totp");
    expect(rotated.staff.email).toBe(email);
    expect(await auditActions(id)).toContain("staff.mfa_enrolled");
  });

  it("requires the code at every later sign-in", async () => {
    const { id } = await newStaff();
    const secret = await enrolTotp(id);

    const token = await signInFirstFactor(id);
    const record = await load(token);
    expect(evaluateStaffSession(record)).toBe("mfa_required");

    const result = await verifyStaffTotp(db, { record, code: generateTotp(secret), cipher });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(evaluateStaffSession(await load(result.session.sessionToken))).toBe("active");
    expect(await auditActions(id)).toContain("auth.mfa_verified");
  });

  it("rejects a code that was already used, even in another session", async () => {
    const { id } = await newStaff();
    const secret = await enrolTotp(id);
    const code = generateTotp(secret);

    const first = await verifyStaffTotp(db, {
      record: await load(await signInFirstFactor(id)),
      code,
      cipher,
    });
    expect(first.ok).toBe(true);
    const replay = await verifyStaffTotp(db, {
      record: await load(await signInFirstFactor(id)),
      code,
      cipher,
    });
    expect(replay).toMatchObject({ ok: false, reason: "invalid" });
  });

  it(`locks the session after ${STAFF_MFA_MAX_ATTEMPTS} wrong codes`, async () => {
    const { id } = await newStaff();
    const secret = await enrolTotp(id);
    const token = await signInFirstFactor(id);
    const wrongCode = generateTotp(secret, new Date(Date.now() + 10 * 60_000));

    for (let attempt = 1; attempt < STAFF_MFA_MAX_ATTEMPTS; attempt++) {
      const result = await verifyStaffTotp(db, {
        record: await load(token),
        code: wrongCode,
        cipher,
      });
      expect(result).toEqual({
        ok: false,
        reason: "invalid",
        attemptsLeft: STAFF_MFA_MAX_ATTEMPTS - attempt,
      });
    }
    const last = await verifyStaffTotp(db, { record: await load(token), code: wrongCode, cipher });
    expect(last).toEqual({ ok: false, reason: "locked" });
    expect(await loadStaffSession(db, token)).toBeNull();
    expect(await auditActions(id)).toContain("auth.mfa_locked");
  });

  it("won't verify an idle session, even with the right code", async () => {
    const { id } = await newStaff();
    const secret = await enrolTotp(id);
    const token = await signInFirstFactor(id, new Date(Date.now() - 31 * 60_000));
    const record = await load(token);
    expect(evaluateStaffSession(record)).toBe("idle");
    expect(await verifyStaffTotp(db, { record, code: generateTotp(secret), cipher })).toEqual({
      ok: false,
      reason: "not_allowed",
    });
  });

  it("won't let a first-factor-only session enrol a new factor if one exists", async () => {
    const { id } = await newStaff();
    await enrolTotp(id);
    const record = await load(await signInFirstFactor(id));
    expect(await startTotpSetup(db, { record, cipher })).toBeNull();
  });
});

describe("staff management", () => {
  it("deactivating a staff member ends all their sessions", async () => {
    const owner = await newStaff("owner");
    const { id } = await newStaff();
    const token = await signInFirstFactor(id);
    await setStaffActive(db, { actorId: owner.id, staffId: id, active: false });
    expect(await loadStaffSession(db, token)).toBeNull();
    expect(await auditActions(id)).toContain("staff.deactivate");
  });

  it("changing a role ends their sessions so new permissions apply at once", async () => {
    const owner = await newStaff("owner");
    const { id } = await newStaff("manager");
    const token = await signInFirstFactor(id);
    await changeStaffRole(db, { actorId: owner.id, staffId: id, role: "staff" });
    expect(await loadStaffSession(db, token)).toBeNull();
    const [row] = await db.select().from(staffUsers).where(eq(staffUsers.id, id));
    expect(row!.role).toBe("staff");
  });

  it("stops owners locking themselves out", async () => {
    const owner = await newStaff("owner");
    await expect(
      setStaffActive(db, { actorId: owner.id, staffId: owner.id, active: false }),
    ).rejects.toThrow("You can't deactivate yourself");
    await expect(
      changeStaffRole(db, { actorId: owner.id, staffId: owner.id, role: "staff" }),
    ).rejects.toThrow("You can't change your own role");
  });

  it("rejects duplicate staff emails regardless of case", async () => {
    const { email } = await newStaff();
    await expect(
      createStaff(
        db,
        { email: email.toUpperCase(), name: "Dupe", role: "staff" },
        { type: "system" },
      ),
    ).rejects.toThrow("already exists");
  });
});
