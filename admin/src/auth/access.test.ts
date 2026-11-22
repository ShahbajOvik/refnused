import { describe, expect, it } from "vitest";

import { authorizeStaff, decideAdminAccess } from "@/auth/access";
import {
  evaluateStaffSession,
  STAFF_IDLE_TIMEOUT_MS,
  type StaffSessionRecord,
} from "@/auth/staff-session";

const NOW = new Date("2026-11-17T10:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

function session(
  overrides: Partial<StaffSessionRecord> = {},
  staff: Partial<StaffSessionRecord["staff"]> = {},
): StaffSessionRecord {
  return {
    sessionToken: "t",
    expires: new Date(NOW.getTime() + 3_600_000),
    createdAt: minutesAgo(10),
    lastActiveAt: minutesAgo(1),
    ...overrides,
    staff: {
      id: "s1",
      email: "jo@example.com",
      name: "Jo",
      role: "staff",
      isActive: true,
      ...staff,
    },
  };
}

describe("evaluateStaffSession", () => {
  it("is active once signed in (no second step)", () => {
    expect(evaluateStaffSession(session(), NOW)).toBe("active");
  });

  it("is missing without a session", () => {
    expect(evaluateStaffSession(null, NOW)).toBe("missing");
  });

  it("times out after 30 minutes idle, not before", () => {
    expect(STAFF_IDLE_TIMEOUT_MS).toBe(30 * 60 * 1000);
    expect(evaluateStaffSession(session({ lastActiveAt: minutesAgo(29.9) }), NOW)).toBe("active");
    expect(evaluateStaffSession(session({ lastActiveAt: minutesAgo(30.1) }), NOW)).toBe("idle");
  });

  it("expires at the absolute limit", () => {
    expect(evaluateStaffSession(session({ expires: NOW }), NOW)).toBe("expired");
  });

  it("blocks deactivated staff even with a valid session", () => {
    expect(evaluateStaffSession(session({}, { isActive: false }), NOW)).toBe("inactive");
  });
});

describe("decideAdminAccess", () => {
  it("always allows the sign-in pages", () => {
    expect(decideAdminAccess({ pathname: "/admin/sign-in", status: "missing" })).toEqual({
      type: "allow",
    });
    expect(decideAdminAccess({ pathname: "/admin/sign-in/check-email", status: "idle" })).toEqual({
      type: "allow",
    });
  });

  it("sends signed-out visitors to sign in, keeping where they were going", () => {
    expect(decideAdminAccess({ pathname: "/admin/staff", status: "missing" })).toEqual({
      type: "redirect",
      to: "/admin/sign-in?callbackUrl=%2Fadmin%2Fstaff",
      endSession: false,
    });
  });

  it.each(["idle", "expired", "inactive"] as const)("ends %s sessions", (status) => {
    const decision = decideAdminAccess({ pathname: "/admin", status });
    expect(decision).toEqual({
      type: "redirect",
      to: `/admin/sign-in?reason=${status}`,
      endSession: true,
    });
  });

  it("lets a signed-in session straight in, with no 2FA pages", () => {
    expect(decideAdminAccess({ pathname: "/admin", status: "active", role: "staff" })).toEqual({
      type: "allow",
    });
  });

  it("checks the role for each section", () => {
    expect(
      decideAdminAccess({ pathname: "/admin/staff", status: "active", role: "owner" }),
    ).toEqual({ type: "allow" });
    expect(
      decideAdminAccess({ pathname: "/admin/staff", status: "active", role: "manager" }),
    ).toEqual({ type: "forbidden" });
    expect(
      decideAdminAccess({ pathname: "/admin/prices", status: "active", role: "staff" }),
    ).toEqual({ type: "forbidden" });
    expect(
      decideAdminAccess({ pathname: "/admin/content", status: "active", role: "content_editor" }),
    ).toEqual({ type: "allow" });
    expect(
      decideAdminAccess({ pathname: "/admin/orders", status: "active", role: "content_editor" }),
    ).toEqual({ type: "forbidden" });
  });

  it("forbids an active session with no role", () => {
    expect(decideAdminAccess({ pathname: "/admin", status: "active" })).toEqual({
      type: "forbidden",
    });
  });
});

describe("authorizeStaff (every admin action)", () => {
  it("rejects sessions that aren't fully signed in", () => {
    for (const status of ["missing", "idle", "expired", "inactive"] as const) {
      expect(authorizeStaff(status, session(), "admin.access")).toMatchObject({
        ok: false,
        denied: false,
      });
    }
  });

  it("rejects roles without the permission and flags it for audit", () => {
    expect(authorizeStaff("active", session({}, { role: "staff" }), "prices.update")).toMatchObject(
      {
        ok: false,
        denied: true,
      },
    );
  });

  it("allows roles with the permission", () => {
    expect(
      authorizeStaff("active", session({}, { role: "manager" }), "prices.update"),
    ).toMatchObject({ ok: true });
  });
});
