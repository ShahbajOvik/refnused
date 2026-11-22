import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { authorizeStaff, decideAdminAccess } from "@/auth/access";
import {
  CUSTOMER_SESSION_COOKIE,
  STAFF_SESSION_COOKIE,
  staffSessionCookieOptions,
} from "@/auth/cookies";
import { customerAuth } from "@/auth/customer";
import { can, type Permission } from "@/auth/roles";
import { loadStaffSession } from "@/auth/staff-service";
import {
  evaluateStaffSession,
  type StaffSessionRecord,
  type StaffSessionStatus,
} from "@/auth/staff-session";
import { siteConfig } from "@/config/site";
import { db } from "@/db";
import { ActionError } from "@/lib/action-error";
import { recordAudit } from "@/lib/audit";
import { publicEnv } from "@/lib/env";
import { getRequestMeta } from "@/lib/request-meta";

// Customers -------------------------------------------------------------------

/** The signed-in customer, or a redirect to /sign-in. */
export async function requireCustomer(callbackUrl = "/account") {
  const session = await customerAuth();
  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  return session.user as typeof session.user & { id: string };
}

export async function hasCustomerSessionCookie() {
  return (await cookies()).has(CUSTOMER_SESSION_COOKIE);
}

// Staff -----------------------------------------------------------------------

export async function getStaffSession(): Promise<{
  status: StaffSessionStatus;
  record: StaffSessionRecord | null;
}> {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  const record = token ? await loadStaffSession(db, token) : null;
  return { status: evaluateStaffSession(record), record };
}

/**
 * Use at the top of every /admin page. Redirects unless the staff member
 * is fully signed in (both factors, not idle) and has `permission`.
 * The proxy checks too, but this is the check that counts.
 */
export async function requireStaff(permission: Permission, pathname = "/admin") {
  const { status, record } = await getStaffSession();
  if (status !== "active" || !record) {
    const decision = decideAdminAccess({ pathname, status });
    redirect(decision.type === "redirect" ? decision.to : "/admin/sign-in");
  }
  if (!can(record.staff.role, permission))
    redirect(`/admin?denied=${encodeURIComponent(permission)}`);
  return record;
}

/** For the 2FA pages: a session that has done the first factor only. */
export async function requireStaffAwaitingMfa(expected: "mfa_required" | "mfa_setup_required") {
  const { status, record } = await getStaffSession();
  if (status === "active") redirect("/admin");
  if (status !== expected || !record) {
    const decision = decideAdminAccess({ pathname: "/admin", status });
    redirect(decision.type === "redirect" ? decision.to : "/admin/sign-in");
  }
  return record;
}

/** Replaces the staff cookie after the session token is rotated (post-2FA). */
export async function setStaffSessionCookie(session: { sessionToken: string; expires: Date }) {
  (await cookies()).set(
    STAFF_SESSION_COOKIE,
    session.sessionToken,
    staffSessionCookieOptions(session.expires),
  );
}

// Admin server actions ----------------------------------------------------------

export type ActionResult<T = void> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Wraps every admin server action: checks the session (both factors, not
 * idle, active account) and the permission on every call, then validates
 * input with Zod. Denied attempts are written to audit_log.
 *
 *   export const updatePrice = staffAction("prices.update", schema, async ({ staff, input }) => …)
 */
export function staffAction<Schema extends z.ZodType, Result>(
  permission: Permission,
  schema: Schema,
  handler: (ctx: {
    staff: StaffSessionRecord["staff"];
    input: z.output<Schema>;
    meta: Awaited<ReturnType<typeof getRequestMeta>>;
  }) => Promise<Result>,
) {
  return async (raw: z.input<Schema>): Promise<ActionResult<Result>> => {
    const { status, record } = await getStaffSession();
    const auth = authorizeStaff(status, record, permission);
    const meta = await getRequestMeta();
    if (!auth.ok) {
      if (auth.denied && record) {
        await recordAudit(
          db,
          {
            actorType: "staff",
            actorId: record.staff.id,
            action: "auth.permission_denied",
            entityType: "permission",
            entityId: permission,
          },
          meta,
        );
      }
      return { ok: false, error: auth.error };
    }

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Check the details and try again.",
        fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
      };
    }
    try {
      return { ok: true, data: await handler({ staff: auth.staff, input: parsed.data, meta }) };
    } catch (error) {
      if (error instanceof ActionError) return { ok: false, error: error.message };
      throw error;
    }
  };
}

/** WebAuthn relying party for staff passkeys. */
export function staffRelyingParty() {
  const url = new URL(publicEnv.NEXT_PUBLIC_SITE_URL);
  return { name: `${siteConfig.name} admin`, id: url.hostname, origin: url.origin };
}
