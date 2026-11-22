import { NextResponse, type NextRequest } from "next/server";

import { decideAdminAccess } from "@/auth/access";
import { CUSTOMER_SESSION_COOKIE, STAFF_SESSION_COOKIE } from "@/auth/cookies";
import { deleteStaffSession, loadStaffSession, recordStaffActivity } from "@/auth/staff-service";
import { evaluateStaffSession, shouldRecordActivity } from "@/auth/staff-session";
import { db } from "@/db";
import { recordAudit } from "@/lib/audit";
import { publicEnv } from "@/lib/env";
import { buildCsp, createNonce } from "@/lib/security/csp";

/**
 * Next.js proxy (formerly "middleware"). Runs before the sensitive routes
 * (src/lib/security/csp.ts SENSITIVE_PREFIXES).
 *
 * - All of them: a fresh nonce and the strict Content Security Policy. Next.js
 *   reads the nonce from the request's CSP header and puts it on its
 *   scripts; these routes render per request so that works.
 * - Secret-link pages (orders, trade-in tracking): Referrer-Policy no-referrer.
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

  const nonce = createNonce();
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL,
    mediaBaseUrl: publicEnv.NEXT_PUBLIC_MEDIA_BASE_URL,
    sentryDsn: publicEnv.NEXT_PUBLIC_SENTRY_DSN,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });
  const secure = (response: NextResponse) => {
    response.headers.set("Content-Security-Policy", csp);
    if (pathname.startsWith("/orders/") || pathname.startsWith("/sell/track/")) {
      response.headers.set("Referrer-Policy", "no-referrer");
    }
    return response;
  };

  if (pathname === "/account" || pathname.startsWith("/account/")) {
    if (request.cookies.has(CUSTOMER_SESSION_COOKIE)) return secure(next());
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("callbackUrl", pathname + search);
    return secure(NextResponse.redirect(url));
  }

  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) return secure(next());

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

// Keep in sync with SENSITIVE_PREFIXES (src/lib/security/csp.test.tsx checks).
export const config = {
  matcher: [
    "/account",
    "/account/:path*",
    "/admin",
    "/admin/:path*",
    "/basket",
    "/checkout",
    "/orders/:path*",
    "/sell/track/:path*",
    "/sign-in",
    "/sign-in/:path*",
  ],
};
