import { NextResponse, type NextRequest } from "next/server";

import { CUSTOMER_SESSION_COOKIE } from "@/auth/cookies";
import { publicEnv } from "@refnused/database/lib/env";
import { buildCsp, createNonce } from "@refnused/database/lib/security/csp";

/**
 * Next.js proxy (formerly "middleware"). Runs before the sensitive routes
 * (SENSITIVE_PREFIXES in @refnused/database/lib/security/csp).
 *
 * - All of them: a fresh nonce and the strict Content Security Policy. Next.js
 *   reads the nonce from the request's CSP header and puts it on its
 *   scripts; these routes render per request so that works.
 * - Secret-link pages (orders, trade-in tracking): Referrer-Policy no-referrer.
 *
 * - /account: needs a customer session cookie (the page validates it).
 *
 * The admin is a separate app with its own proxy (admin/src/proxy.ts).
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

  return secure(next());
}

// Keep in sync with SENSITIVE_PREFIXES (src/lib/security/csp.test.tsx checks).
export const config = {
  matcher: [
    "/account",
    "/account/:path*",
    "/basket",
    "/checkout",
    "/orders/:path*",
    "/sell/track/:path*",
    "/sign-in",
    "/sign-in/:path*",
  ],
};
