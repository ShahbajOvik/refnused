// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffSessionRecord } from "@/auth/staff-session";

const loadStaffSession = vi.fn();
const deleteStaffSession = vi.fn();
const recordStaffActivity = vi.fn();
const recordAudit = vi.fn();

vi.mock("@refnused/database/db", () => ({ db: {} }));
vi.mock("@refnused/database/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));
vi.mock("@/auth/staff-service", () => ({
  loadStaffSession: (...a: unknown[]) => loadStaffSession(...a),
  deleteStaffSession: (...a: unknown[]) => deleteStaffSession(...a),
  recordStaffActivity: (...a: unknown[]) => recordStaffActivity(...a),
}));

const { proxy } = await import("@/proxy");
const { CUSTOMER_SESSION_COOKIE, STAFF_SESSION_COOKIE } = await import("@/auth/cookies");

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

function record(
  overrides: Partial<StaffSessionRecord> = {},
  role: StaffSessionRecord["staff"]["role"] = "staff",
): StaffSessionRecord {
  return {
    sessionToken: "tok",
    expires: new Date(Date.now() + 3_600_000),
    createdAt: minutesAgo(20),
    lastActiveAt: minutesAgo(5),
    mfaVerifiedAt: minutesAgo(19),
    mfaMethod: "totp",
    mfaFailedAttempts: 0,
    ...overrides,
    staff: {
      id: "s1",
      email: "s@example.com",
      name: "S",
      role,
      isActive: true,
      hasTotp: true,
      passkeyCount: 0,
    },
  };
}

function request(
  path: string,
  cookies: Record<string, string> = {},
  headers: Record<string, string> = {},
) {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { ...(cookie ? { cookie } : {}), ...headers },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("proxy: /account", () => {
  it("redirects to sign-in without a customer session", async () => {
    const res = await proxy(request("/account/orders?x=1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/sign-in?callbackUrl=%2Faccount%2Forders%3Fx%3D1",
    );
  });

  it("lets a customer session through (the page validates it)", async () => {
    const res = await proxy(request("/account", { [CUSTOMER_SESSION_COOKIE]: "abc" }));
    expect(res.headers.get("location")).toBeNull();
  });

  it("does not accept a staff cookie as a customer session", async () => {
    const res = await proxy(request("/account", { [STAFF_SESSION_COOKIE]: "abc" }));
    expect(res.headers.get("location")).toContain("/sign-in");
  });
});

describe("proxy: /admin", () => {
  it("redirects to staff sign-in without a session", async () => {
    loadStaffSession.mockResolvedValue(null);
    const res = await proxy(request("/admin"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/admin/sign-in");
    expect(loadStaffSession).not.toHaveBeenCalled();
  });

  it("does not accept a customer cookie as a staff session", async () => {
    const res = await proxy(request("/admin", { [CUSTOMER_SESSION_COOKIE]: "abc" }));
    expect(res.headers.get("location")).toBe("http://localhost:3000/admin/sign-in");
  });

  it("ends idle sessions, clears the cookie and logs the timeout", async () => {
    loadStaffSession.mockResolvedValue(record({ lastActiveAt: minutesAgo(31) }));
    const res = await proxy(request("/admin/orders", { [STAFF_SESSION_COOKIE]: "tok" }));
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/admin/sign-in?reason=idle&callbackUrl=%2Fadmin%2Forders",
    );
    expect(deleteStaffSession).toHaveBeenCalledWith({}, "tok");
    expect(res.cookies.get(STAFF_SESSION_COOKIE)?.value).toBe("");
    expect(recordAudit).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ action: "auth.session_timeout" }),
      expect.anything(),
    );
  });

  it("sends first-factor-only sessions to 2FA", async () => {
    loadStaffSession.mockResolvedValue(record({ mfaVerifiedAt: null }));
    const res = await proxy(request("/admin", { [STAFF_SESSION_COOKIE]: "tok" }));
    expect(res.headers.get("location")).toBe("http://localhost:3000/admin/verify");
  });

  it("blocks roles from sections they can't use", async () => {
    loadStaffSession.mockResolvedValue(record({}, "content_editor"));
    const res = await proxy(request("/admin/staff", { [STAFF_SESSION_COOKIE]: "tok" }));
    expect(res.headers.get("location")).toBe("http://localhost:3000/admin?denied=1");
  });

  it("allows permitted requests, records activity and disables caching", async () => {
    loadStaffSession.mockResolvedValue(record({}, "owner"));
    const res = await proxy(request("/admin/staff", { [STAFF_SESSION_COOKIE]: "tok" }));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(recordStaffActivity).toHaveBeenCalledWith({}, "tok", expect.any(Date));
  });

  it("doesn't count link prefetches as activity", async () => {
    loadStaffSession.mockResolvedValue(record());
    await proxy(
      request("/admin", { [STAFF_SESSION_COOKIE]: "tok" }, { "next-router-prefetch": "1" }),
    );
    expect(recordStaffActivity).not.toHaveBeenCalled();
  });

  it("only writes activity once a minute", async () => {
    loadStaffSession.mockResolvedValue(record({ lastActiveAt: new Date(Date.now() - 10_000) }));
    await proxy(request("/admin", { [STAFF_SESSION_COOKIE]: "tok" }));
    expect(recordStaffActivity).not.toHaveBeenCalled();
  });
});
