// @vitest-environment node
import { randomBytes } from "node:crypto";

import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { hashPassword, newPasswordSchema, verifyPassword } from "@refnused/database/auth/password";
import { createStaff, listStaff, setStaffActive } from "@/auth/staff-admin";
import {
  changeOwnStaffPassword,
  changePasswordSchema,
  PASSWORD_ATTEMPTS_PER_EMAIL,
  PASSWORD_ATTEMPTS_PER_IP,
  PASSWORD_CHANGE_ATTEMPTS,
  passwordSignInSchema,
  setStaffPasswordByEmail,
  signInStaffWithPassword,
  staffHasPassword,
} from "@/auth/staff-password";
import { loadStaffSession } from "@/auth/staff-service";
import { evaluateStaffSession } from "@/auth/staff-session";
import { auditLog, staffSessions, staffUsers } from "@refnused/database/db/schema";
import type { AppDb } from "@refnused/database/db/types";
import { createTestDb } from "@refnused/database/test/db";

// Password hashing is deliberately slow, more so when test files run in parallel.
vi.setConfig({ testTimeout: 60_000 });

let db: AppDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close?.());

const PASSWORD = "correct horse battery";
const secret = "test-secret";

/** A unique IP per call, so the per-IP limit only applies where a test wants it. */
const freshIp = () => `203.0.113.${randomBytes(4).readUInt32BE(0)}`;

async function newStaff(password: string | null = PASSWORD) {
  const email = `pw-${randomBytes(4).toString("hex")}@example.co.uk`;
  const { id } = await createStaff(
    db,
    { email, name: "Password Test", role: "staff" },
    { type: "system" },
  );
  if (password) await setStaffPasswordByEmail(db, { email, password });
  return { id, email };
}

const attempt = (email: string, password: string, ipAddress = freshIp()) =>
  signInStaffWithPassword(db, { email, password, secret, meta: { ipAddress } });

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const hash = await hashPassword(PASSWORD);
    expect(hash).not.toContain(PASSWORD);
    expect(await verifyPassword(PASSWORD, hash)).toBe(true);
    expect(await verifyPassword("wrong password here", hash)).toBe(false);
  });

  it("salts each hash", async () => {
    expect(await hashPassword(PASSWORD)).not.toBe(await hashPassword(PASSWORD));
  });

  it.each([
    "",
    "plain",
    "scrypt$1$2$3$$",
    "bcrypt$65536$8$2$c2FsdA$aGFzaA",
    "scrypt$3$8$2$c2FsdA$aGFzaA",
  ])("never matches a malformed stored hash: %s", async (stored) => {
    expect(await verifyPassword(PASSWORD, stored)).toBe(false);
  });

  it("enforces password length at the boundaries", () => {
    expect(newPasswordSchema.safeParse("a".repeat(11)).success).toBe(false);
    expect(newPasswordSchema.safeParse("a".repeat(12)).success).toBe(true);
    expect(newPasswordSchema.safeParse("a".repeat(128)).success).toBe(true);
    expect(newPasswordSchema.safeParse("a".repeat(129)).success).toBe(false);
  });
});

describe("input validation", () => {
  it("normalises the staff ID and rejects bad input", () => {
    expect(passwordSignInSchema.parse({ email: " Jo@Example.co.uk ", password: "x" }).email).toBe(
      "jo@example.co.uk",
    );
    expect(passwordSignInSchema.safeParse({ email: "jo", password: "x" }).success).toBe(false);
    expect(
      passwordSignInSchema.safeParse({ email: "jo@example.co.uk", password: "" }).success,
    ).toBe(false);
    expect(
      passwordSignInSchema.safeParse({ email: "jo@example.co.uk", password: "a".repeat(129) })
        .success,
    ).toBe(false);
  });

  it("requires the new passwords to match", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "",
      newPassword: PASSWORD,
      confirmPassword: `${PASSWORD}!`,
    });
    expect(result.success).toBe(false);
  });
});

describe("password sign-in", () => {
  it("creates a fully signed-in session (no second step)", async () => {
    const { id, email } = await newStaff();
    const result = await attempt(email.toUpperCase(), PASSWORD);
    if (!result.ok) throw new Error("expected sign-in to succeed");

    const record = await loadStaffSession(db, result.session.sessionToken);
    expect(record?.staff.id).toBe(id);
    expect(evaluateStaffSession(record)).toBe("active");
  });

  it("audits the sign-in without storing the password", async () => {
    const { id, email } = await newStaff();
    await attempt(email, PASSWORD);
    const entries = await db.select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(entries.map((e) => e.action)).toContain("auth.sign_in");
    expect(JSON.stringify(entries)).not.toContain(PASSWORD);
  });

  it("gives the same answer for a wrong password, an unknown email and no password set", async () => {
    const { email } = await newStaff();
    const { email: noPassword } = await newStaff(null);
    const denied = { ok: false, reason: "invalid" };
    expect(await attempt(email, "wrong password here")).toEqual(denied);
    expect(await attempt("nobody@example.co.uk", PASSWORD)).toEqual(denied);
    expect(await attempt(noPassword, PASSWORD)).toEqual(denied);
  });

  it("creates no session on failure and records the denial", async () => {
    const { id, email } = await newStaff();
    await attempt(email, "wrong password here");
    expect(await db.select().from(staffSessions).where(eq(staffSessions.userId, id))).toEqual([]);

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "auth.sign_in_denied"))
      .orderBy(desc(auditLog.id))
      .limit(1);
    expect(entry!.changes).toMatchObject({
      after: { provider: "password", reason: "invalid_credentials", email },
    });
    expect(JSON.stringify(entry)).not.toContain("wrong password here");
  });

  it("denies deactivated staff even with the right password", async () => {
    const owner = await newStaff(null);
    const { id, email } = await newStaff();
    await setStaffActive(db, { actorId: owner.id, staffId: id, active: false });
    expect(await attempt(email, PASSWORD)).toEqual({ ok: false, reason: "invalid" });
  });

  it(`blocks an email after ${PASSWORD_ATTEMPTS_PER_EMAIL} attempts, even with the right password`, async () => {
    const { email } = await newStaff();
    for (let i = 0; i < PASSWORD_ATTEMPTS_PER_EMAIL; i++) {
      expect(await attempt(email, "wrong password here")).toMatchObject({ reason: "invalid" });
    }
    expect(await attempt(email, PASSWORD)).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("allows attempts again once the window has passed", async () => {
    const { email } = await newStaff();
    const start = new Date();
    for (let i = 0; i <= PASSWORD_ATTEMPTS_PER_EMAIL; i++) {
      await signInStaffWithPassword(db, {
        email,
        password: "wrong password here",
        secret,
        meta: { ipAddress: freshIp() },
        now: start,
      });
    }
    const later = await signInStaffWithPassword(db, {
      email,
      password: PASSWORD,
      secret,
      meta: { ipAddress: freshIp() },
      now: new Date(start.getTime() + 16 * 60_000),
    });
    expect(later.ok).toBe(true);
  });

  it(`blocks an IP after ${PASSWORD_ATTEMPTS_PER_IP} attempts across different emails`, async () => {
    const ip = freshIp();
    for (let i = 0; i < PASSWORD_ATTEMPTS_PER_IP; i++) {
      await signInStaffWithPassword(db, {
        email: `spray-${i}@example.co.uk`,
        password: "x",
        secret,
        meta: { ipAddress: ip },
      });
    }
    const { email } = await newStaff();
    expect(await attempt(email, PASSWORD, ip)).toEqual({ ok: false, reason: "rate_limited" });
  }, 60_000);
});

describe("changing a password", () => {
  const NEW_PASSWORD = "a different long passphrase";

  async function signedIn(email: string) {
    const result = await attempt(email, PASSWORD);
    if (!result.ok) throw new Error("expected sign-in to succeed");
    return result.session.sessionToken;
  }

  it("needs the current password", async () => {
    const { id, email } = await newStaff();
    const sessionToken = await signedIn(email);
    await expect(
      changeOwnStaffPassword(db, {
        staffId: id,
        currentPassword: "wrong password here",
        newPassword: NEW_PASSWORD,
        sessionToken,
        secret,
      }),
    ).rejects.toThrow("current password");
    expect((await attempt(email, PASSWORD)).ok).toBe(true);
  });

  it("swaps the password, keeps this session and ends the others", async () => {
    const { id, email } = await newStaff();
    const current = await signedIn(email);
    const other = await signedIn(email);

    await changeOwnStaffPassword(db, {
      staffId: id,
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      sessionToken: current,
      secret,
    });

    expect(await loadStaffSession(db, current)).not.toBeNull();
    expect(await loadStaffSession(db, other)).toBeNull();
    expect((await attempt(email, PASSWORD)).ok).toBe(false);
    expect((await attempt(email, NEW_PASSWORD)).ok).toBe(true);

    const entries = await db.select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(entries.map((e) => e.action)).toContain("staff.password_set");
    expect(JSON.stringify(entries)).not.toContain(NEW_PASSWORD);
  });

  it("lets someone with no password set their first one", async () => {
    const { id, email } = await newStaff(null);
    expect(await staffHasPassword(db, id)).toBe(false);
    await changeOwnStaffPassword(db, {
      staffId: id,
      currentPassword: "",
      newPassword: NEW_PASSWORD,
      sessionToken: "none",
      secret,
    });
    expect(await staffHasPassword(db, id)).toBe(true);
    expect((await attempt(email, NEW_PASSWORD)).ok).toBe(true);
  });

  it(`stops guessing the current password after ${PASSWORD_CHANGE_ATTEMPTS} tries`, async () => {
    const { id, email } = await newStaff();
    const sessionToken = await signedIn(email);
    const change = (currentPassword: string) =>
      changeOwnStaffPassword(db, {
        staffId: id,
        currentPassword,
        newPassword: NEW_PASSWORD,
        sessionToken,
        secret,
      });
    for (let i = 0; i < PASSWORD_CHANGE_ATTEMPTS; i++) {
      await expect(change("wrong password here")).rejects.toThrow("current password");
    }
    await expect(change(PASSWORD)).rejects.toThrow("Too many attempts");
  });

  it("the command-line reset signs the person out everywhere", async () => {
    const { email } = await newStaff();
    const token = await signedIn(email);
    await setStaffPasswordByEmail(db, { email, password: NEW_PASSWORD });
    expect(await loadStaffSession(db, token)).toBeNull();
  });

  it("the command-line reset rejects short passwords and unknown staff", async () => {
    const { email } = await newStaff();
    await expect(setStaffPasswordByEmail(db, { email, password: "short" })).rejects.toThrow();
    await expect(
      setStaffPasswordByEmail(db, { email: "nobody@example.co.uk", password: NEW_PASSWORD }),
    ).rejects.toThrow("No staff account");
  });

  it("stores only a hash, and the staff list never includes it", async () => {
    const { id } = await newStaff();
    const [row] = await db.select().from(staffUsers).where(eq(staffUsers.id, id));
    expect(row!.passwordHash).toMatch(/^scrypt\$/);

    const listed = (await listStaff(db)).find((s) => s.id === id);
    expect(listed).toBeDefined();
    expect(JSON.stringify(listed)).not.toContain("scrypt");
  });
});
