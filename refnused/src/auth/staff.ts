import "server-only";

import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";

import { authCookies, STAFF_SESSION_COOKIE, useSecureCookies } from "@/auth/cookies";
import { sendMagicLink } from "@/auth/email";
import { checkStaffSignIn, logSignIn, logSignOut } from "@/auth/sign-in-rules";
import { STAFF_SESSION_MAX_AGE_SECONDS } from "@/auth/staff-session";
import { db } from "@/db";
import { staffAccounts, staffSessions, staffUsers, staffVerificationTokens } from "@/db/schema";
import { isGoogleSignInEnabled, serverEnv } from "@/lib/env.server";
import { getRequestMeta } from "@/lib/request-meta";

const MAGIC_LINK_MINUTES = 10;

const drizzleAdapter = DrizzleAdapter(db, {
  usersTable: staffUsers,
  accountsTable: staffAccounts,
  sessionsTable: staffSessions,
  verificationTokensTable: staffVerificationTokens,
});

/** Staff are created by an owner, never by signing in. */
const adapter: Adapter = {
  ...drizzleAdapter,
  createUser: () => {
    throw new Error("Staff accounts can only be created by an owner");
  },
};

/**
 * Staff authentication, first factor only: magic link or Google.
 * Served from /api/staff-auth with its own cookies and session table.
 * Password sign-in is the third first factor, in src/auth/staff-password.ts.
 *
 * After this, the session must complete a second factor (passkey or TOTP)
 * at /admin/verify before it can reach /admin. That, the 30-minute idle
 * timeout and role checks are enforced by src/proxy.ts and
 * src/auth/guards.ts, using src/auth/staff-session.ts.
 */
export const {
  handlers: staffHandlers,
  signIn: staffSignIn,
  signOut: staffSignOut,
} = NextAuth({
  basePath: "/api/staff-auth",
  secret: serverEnv.AUTH_SECRET,
  trustHost: true,
  useSecureCookies,
  /*
   * Staff have no Auth.js passkey provider (staff passkeys are our own second
   * step). This flag is still needed: @auth/core's config check keeps
   * "has a WebAuthn provider" in module state shared by every instance, so
   * once the customer instance (which has passkeys) has run, staff requests
   * would fail with ExperimentalFeatureNotEnabled.
   */
  experimental: { enableWebAuthn: true },
  cookies: authCookies("ru.staff", STAFF_SESSION_COOKIE),
  adapter,
  session: {
    strategy: "database",
    maxAge: STAFF_SESSION_MAX_AGE_SECONDS,
    // Never extend: 12 hours is an absolute limit. Idle timeout is ours.
    updateAge: STAFF_SESSION_MAX_AGE_SECONDS,
  },
  providers: [
    Resend({
      apiKey: serverEnv.AUTH_RESEND_KEY ?? "console",
      from: serverEnv.EMAIL_FROM,
      maxAge: MAGIC_LINK_MINUTES * 60,
      sendVerificationRequest: ({ identifier, url }) =>
        sendMagicLink({ to: identifier, url, area: "staff", expiresInMinutes: MAGIC_LINK_MINUTES }),
    }),
    ...(isGoogleSignInEnabled
      ? [
          Google({
            clientId: serverEnv.AUTH_GOOGLE_ID,
            clientSecret: serverEnv.AUTH_GOOGLE_SECRET,
            // Staff accounts are pre-created by email; link Google to them.
            // Safe because signIn requires Google's email_verified claim.
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
  pages: {
    signIn: "/admin/sign-in",
    verifyRequest: "/admin/sign-in/check-email",
    error: "/admin/sign-in",
  },
  callbacks: {
    async signIn({ user, account, profile, email }) {
      return checkStaffSignIn(db, {
        email: user.email,
        provider: account?.provider,
        emailVerified: (profile as { email_verified?: boolean } | undefined)?.email_verified,
        isVerificationRequest: email?.verificationRequest === true,
        meta: await getRequestMeta(),
      });
    },
    // After the first factor, always go to 2FA; the proxy sends the user on.
    redirect({ url, baseUrl }) {
      const target = new URL(url, baseUrl);
      if (target.origin !== baseUrl) return `${baseUrl}/admin`;
      return target.toString();
    },
  },
  events: {
    async signIn({ user, account }) {
      await logSignIn(db, {
        area: "staff",
        userId: user.id,
        provider: account?.provider,
        meta: await getRequestMeta(),
      });
    },
    async signOut(message) {
      const userId = "session" in message ? message.session?.userId : undefined;
      await logSignOut(db, { area: "staff", userId, meta: await getRequestMeta() });
    },
  },
});
