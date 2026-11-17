import { describe, expect, it } from "vitest";

import { authorizeStaff, decideAdminAccess, safeCallbackUrl } from "@/auth/access";
import {
  evaluateStaffSession,
  STAFF_IDLE_TIMEOUT_MS,
  STAFF_MFA_MAX_ATTEMPTS,
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
    mfaVerifiedAt: minutesAgo(9),
    mfaMethod: "passkey",
    mfaFailedAttempts: 0,
    ...overrides,
    staff: {
      id: "s1",
      email: "jo@example.com",
      name: "Jo",
      role: "staff",
      isActive: true,
      hasTotp: true,
      passkeyCount: 1,
      ...staff,
    },
  };
}

describe("evaluateStaffSession", () => {
  it("is active with both factors", () => {
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

  it("requires 2FA after the first factor", () => {
    expect(evaluateStaffSession(session({ mfaVerifiedAt: null }), NOW)).toBe("mfa_required");
  });

  it("requires 2FA setup when no factor is enrolled", () => {
    expect(
      evaluateStaffSession(
        session({ mfaVerifiedAt: null }, { hasTotp: false, passkeyCount: 0 }),
        NOW,
      ),
    ).toBe("mfa_setup_required");
  });

  it("locks after too many wrong codes", () => {
    expect(
      evaluateStaffSession(
        session({ mfaVerifiedAt: null, mfaFailedAttempts: STAFF_MFA_MAX_ATTEMPTS }),
        NOW,
      ),
    ).toBe("locked");
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

  it.each(["idle", "expired", "inactive", "locked"] as const)("ends %s sessions", (status) => {
    const decision = decideAdminAccess({ pathname: "/admin", status });
    expect(decision).toEqual({
      type: "redirect",
      to: `/admin/sign-in?reason=${status}`,
      endSession: true,
    });
  });

  it("sends first-factor-only sessions to 2FA and nowhere else", () => {
    expect(
      decideAdminAccess({ pathname: "/admin/staff", status: "mfa_required", role: "owner" }),
    ).toEqual({
      type: "redirect",
      to: "/admin/verify?callbackUrl=%2Fadmin%2Fstaff",
    });
    expect(decideAdminAccess({ pathname: "/admin/verify", status: "mfa_required" })).toEqual({
      type: "allow",
    });
    // Can't jump to setup to enrol a new factor without verifying an existing one.
    expect(decideAdminAccess({ pathname: "/admin/setup-2fa", status: "mfa_required" }).type).toBe(
      "redirect",
    );
  });

  it("sends staff without a second factor to setup", () => {
    expect(decideAdminAccess({ pathname: "/admin", status: "mfa_setup_required" })).toEqual({
      type: "redirect",
      to: "/admin/setup-2fa",
    });
    expect(
      decideAdminAccess({ pathname: "/admin/setup-2fa", status: "mfa_setup_required" }),
    ).toEqual({
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
    for (const status of [
      "missing",
      "mfa_required",
      "mfa_setup_required",
      "idle",
      "locked",
    ] as const) {
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

describe("safeCallbackUrl", () => {
  it.each([
    ["/admin/staff", "/admin/staff"],
    ["/account?tab=orders", "/account?tab=orders"],
    ["https://evil.example", "/fallback"],
    ["//evil.example", "/fallback"],
    ["/\\evil.example", "/fallback"],
    ["javascript:alert(1)", "/fallback"],
    [undefined, "/fallback"],
    [["/a", "/b"], "/fallback"],
  ])("%j → %s", (input, expected) => {
    expect(safeCallbackUrl(input, "/fallback")).toBe(expected);
  });
});
