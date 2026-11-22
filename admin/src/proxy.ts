import { NextResponse, type NextRequest } from "next/server";

import { decideAdminAccess } from "@/auth/access";
import { STAFF_SESSION_COOKIE } from "@/auth/cookies";
import { deleteStaffSession, loadStaffSession, recordStaffActivity } from "@/auth/staff-service";
import { evaluateStaffSession, shouldRecordActivity } from "@/auth/staff-session";
import { db } from "@refnused/database/db";
import { recordAudit } from "@refnused/database/lib/audit";
import { publicEnv } from "@refnused/database/lib/env";
import { buildCsp, createNonce } from "@refnused/database/lib/security/csp";

/**
 * Admin proxy (Next.js "middleware"). Runs before every admin page:
 *
 * - A fresh nonce and the strict Content Security Policy on every page
 *   (the admin renders per request).
 * - Loads the staff session and applies the same rules as requireStaff():
 *   both factors done, not idle for 30 minutes, account active, and the role
 *   allowed for that section. Records activity for the idle timeout.
 *
 * This is a first line of defence. Every page and server action checks
 * again on the server (src/auth/guards.ts).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const nonce = createNonce();
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    siteUrl: publicEnv.NEXT_PUBLIC_ADMIN_URL,
    mediaBaseUrl: publicEnv.NEXT_PUBLIC_MEDIA_BASE_URL,
    sentryDsn: publicEnv.NEXT_PUBLIC_SENTRY_DSN,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });
  const secure = (response: NextResponse) => {
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  // The admin only serves /admin (and its Auth.js routes); send anything else there.
  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) {
    return secure(NextResponse.redirect(new URL("/admin", request.url)));
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
    return secure(response);
  }

  if (decision.type === "forbidden") {
    return secure(NextResponse.redirect(new URL("/admin?denied=1", request.url)));
  }

  // Count real navigation and actions as activity, but not link prefetches.
  const isPrefetch =
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch";
  if (record && token && !isPrefetch && shouldRecordActivity(record, now)) {
    await recordStaffActivity(db, token, now);
  }

  const response = next();
  // Admin pages are personal: never cache them anywhere.
  response.headers.set("Cache-Control", "private, no-store");
  return secure(response);
}

export const config = {
  // Everything except static files and the staff Auth.js routes.
  matcher: ["/((?!_next/static|_next/image|api/staff-auth|favicon.ico|icon.svg).*)"],
};
