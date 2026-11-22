import type { NextRequest } from "next/server";

type Handler = (request: NextRequest) => Promise<Response>;

/** /api/auth/signin/resend, /api/staff-auth/signin/resend (any trailing slash). */
export function isDirectEmailSignIn(pathname: string): boolean {
  return /\/signin\/resend\/?$/.test(pathname);
}

/**
 * Auth.js would send a magic link to anyone who POSTs to /signin/resend with
 * a CSRF token from /csrf, skipping our Turnstile and rate limits. Our sign-in
 * forms call signIn() from Server Actions (magic-link-guard.ts first), which
 * doesn't go through this route, so the HTTP endpoint is closed.
 */
export function withoutDirectEmailSignIn(handler: Handler): Handler {
  return async (request) =>
    isDirectEmailSignIn(new URL(request.url).pathname)
      ? new Response("Not found", { status: 404 })
      : handler(request);
}
