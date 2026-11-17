import { NextResponse, type NextRequest } from "next/server";

import { decideAdminAccess } from "@/auth/access";
import { CUSTOMER_SESSION_COOKIE, STAFF_SESSION_COOKIE } from "@/auth/cookies";
import { deleteStaffSession, loadStaffSession, recordStaffActivity } from "@/auth/staff-service";
import { evaluateStaffSession, shouldRecordActivity } from "@/auth/staff-session";
import { db } from "@/db";
import { recordAudit } from "@/lib/audit";

/**
 * Next.js proxy (formerly "middleware"). Runs before /account and /admin.
 *
 * - /account: needs a customer session cookie (the page validates it).
 * - /admin: loads the staff session and applies the same rules as
 *   requireStaff(): both factors done, not idle for 30 minutes, account
 *   active, and the role allowed for that section. Also records activity
 *   for the idle timeout.
 *
 * This is a first line of defence. Every page and server action checks
 * again on the server (src/auth/guards.ts).
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/account" || pathname.startsWith("/account/")) {
    if (request.cookies.has(CUSTOMER_SESSION_COOKIE)) return NextResponse.next();
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(url);
  }

  // /admin
  const token = request.cookies.get(STAFF_SESSION_COOKIE)?.value;
  const record = token ? await loadStaffSession(db, token) : null;
  const now = new Date();
  const status = evaluateStaffSession(record, now);
  const decision = decideAdminAccess({ pathname, status, role: record?.staff.role });

  if (decision.type === "redirect") {
    const response = NextResponse.redirect(new URL(decision.to, request.url));
    if (decision.endSession && token) {
      await deleteStaffSession(db, token);
      if (record && status === "idle") {
        await recordAudit(
          db,
          {
            actorType: "staff",
            actorId: record.staff.id,
            action: "auth.session_timeout",
            entityType: "staff_user",
            entityId: record.staff.id,
          },
          { ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null },
        );
      }
      response.cookies.delete(STAFF_SESSION_COOKIE);
    }
    return response;
  }

  if (decision.type === "forbidden") {
    return NextResponse.redirect(new URL("/admin?denied=1", request.url));
  }

  // Count real navigation and actions as activity, but not link prefetches.
  const isPrefetch =
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch";
  if (record && token && !isPrefetch && shouldRecordActivity(record, now)) {
    await recordStaffActivity(db, token, now);
  }

  const response = NextResponse.next();
  // Admin pages are personal: never cache them anywhere.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/account", "/account/:path*", "/admin", "/admin/:path*"],
};
