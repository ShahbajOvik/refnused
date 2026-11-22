import { can, permissionForAdminPath, type Permission, type StaffRole } from "@/auth/roles";
import {
  isTerminalStatus,
  type StaffSessionRecord,
  type StaffSessionStatus,
} from "@/auth/staff-session";

export const ADMIN_SIGN_IN_PATH = "/admin/sign-in";
export const ADMIN_VERIFY_PATH = "/admin/verify";
export const ADMIN_SETUP_2FA_PATH = "/admin/setup-2fa";

export type AccessDecision =
  | { type: "allow" }
  | { type: "redirect"; to: string; endSession?: boolean }
  | { type: "forbidden" };

const isUnder = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

function withCallback(path: string, callbackUrl: string, extra?: Record<string, string>) {
  const params = new URLSearchParams(extra);
  if (callbackUrl && callbackUrl !== "/admin") params.set("callbackUrl", callbackUrl);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Decides what happens to a request under /admin. Used by the proxy for
 * every request and by requireStaff() on every page and action.
 */
export function decideAdminAccess(input: {
  pathname: string;
  status: StaffSessionStatus;
  role?: StaffRole;
}): AccessDecision {
  const { pathname, status, role } = input;

  // Sign-in pages are public.
  if (isUnder(pathname, ADMIN_SIGN_IN_PATH)) return { type: "allow" };

  if (status === "missing" || isTerminalStatus(status)) {
    return {
      type: "redirect",
      to: withCallback(
        ADMIN_SIGN_IN_PATH,
        pathname,
        status === "missing" ? undefined : { reason: status },
      ),
      endSession: status !== "missing",
    };
  }

  if (status === "mfa_required") {
    return isUnder(pathname, ADMIN_VERIFY_PATH)
      ? { type: "allow" }
      : { type: "redirect", to: withCallback(ADMIN_VERIFY_PATH, pathname) };
  }

  if (status === "mfa_setup_required") {
    return isUnder(pathname, ADMIN_SETUP_2FA_PATH)
      ? { type: "allow" }
      : { type: "redirect", to: withCallback(ADMIN_SETUP_2FA_PATH, pathname) };
  }

  // Fully signed in: the 2FA pages are done with.
  if (isUnder(pathname, ADMIN_VERIFY_PATH) || isUnder(pathname, ADMIN_SETUP_2FA_PATH)) {
    return { type: "redirect", to: "/admin" };
  }

  if (!role || !can(role, permissionForAdminPath(pathname))) return { type: "forbidden" };
  return { type: "allow" };
}

/** Authorisation step of staffAction(): session state, then permission. */
export function authorizeStaff(
  status: StaffSessionStatus,
  record: StaffSessionRecord | null,
  permission: Permission,
):
  { ok: true; staff: StaffSessionRecord["staff"] } | { ok: false; error: string; denied: boolean } {
  if (status !== "active" || !record) {
    return { ok: false, error: "Your session has ended. Sign in again.", denied: false };
  }
  if (!can(record.staff.role, permission)) {
    return { ok: false, error: "You don't have permission to do that.", denied: true };
  }
  return { ok: true, staff: record.staff };
}

export { safeCallbackUrl } from "@refnused/database/lib/security/safe-callback";
