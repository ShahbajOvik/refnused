// @vitest-environment node
import { randomBytes } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  checkStaffSignIn,
  logSignIn,
  STAFF_CHECK_EMAIL_PATH,
  STAFF_DENIED_PATH,
} from "@/auth/sign-in-rules";
import { changeStaffRole, createStaff, setStaffActive } from "@/auth/staff-admin";
import { findStaffForSignIn, loadStaffSession } from "@/auth/staff-service";
import { evaluateStaffSession } from "@/auth/staff-session";
import { auditLog, staffSessions, staffUsers } from "@refnused/database/db/schema";
import type { AppDb } from "@refnused/database/db/types";
import { createTestDb } from "@refnused/database/test/db";

let db: AppDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close?.());

const uniqueEmail = (name: string) => `${name}-${randomBytes(3).toString("hex")}@example.co.uk`;

async function newStaff(role: "owner" | "manager" | "staff" | "content_editor" = "staff") {
  const email = uniqueEmail(role);
  const { id } = await createStaff(db, { email, name: `Test ${role}`, role }, { type: "system" });
  return { id, email };
}

/** What Auth.js does after sign-in: insert a session row. */
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

describe("staff sign-in rules", () => {
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

describe("staff sessions", () => {
  it("are fully signed in straight after sign-in: there is no second step", async () => {
    const { id } = await newStaff();
    const record = await load(await signInFirstFactor(id));
    expect(record.staff.id).toBe(id);
    expect(evaluateStaffSession(record)).toBe("active");
  });

  it("still time out after 30 minutes idle", async () => {
    const { id } = await newStaff();
    const token = await signInFirstFactor(id, new Date(Date.now() - 31 * 60_000));
    expect(evaluateStaffSession(await load(token))).toBe("idle");
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
