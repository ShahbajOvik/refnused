import "server-only";

import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Passkey from "next-auth/providers/passkey";
import Resend from "next-auth/providers/resend";

import { authCookies, CUSTOMER_SESSION_COOKIE, useSecureCookies } from "@/auth/cookies";
import { sendMagicLink } from "@/auth/email";
import { checkCustomerSignIn, logSignIn, logSignOut } from "@/auth/sign-in-rules";
import { db } from "@refnused/database/db";
import {
  customerAccounts,
  customerAuthenticators,
  customers,
  customerSessions,
  customerVerificationTokens,
} from "@refnused/database/db/schema";
import { isGoogleSignInEnabled, serverEnv } from "@refnused/database/lib/env.server";
import { getRequestMeta } from "@refnused/database/lib/request-meta";

const MAGIC_LINK_MINUTES = 30;

/**
 * Customer authentication: magic link (Resend), Google and passkeys.
 * Served from /api/auth. Staff use a separate instance (src/auth/staff.ts).
 */
export const {
  handlers: customerHandlers,
  auth: customerAuth,
  signIn: customerSignIn,
  signOut: customerSignOut,
} = NextAuth({
  basePath: "/api/auth",
  secret: serverEnv.AUTH_SECRET,
  trustHost: true,
  useSecureCookies,
  cookies: authCookies("ru", CUSTOMER_SESSION_COOKIE),
  adapter: DrizzleAdapter(db, {
    usersTable: customers,
    accountsTable: customerAccounts,
    sessionsTable: customerSessions,
    verificationTokensTable: customerVerificationTokens,
    authenticatorsTable: customerAuthenticators,
  }),
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  experimental: { enableWebAuthn: true },
  providers: [
    Resend({
      apiKey: serverEnv.AUTH_RESEND_KEY ?? "console",
      from: serverEnv.EMAIL_FROM,
      maxAge: MAGIC_LINK_MINUTES * 60,
      sendVerificationRequest: ({ identifier, url }) =>
        sendMagicLink({
          to: identifier,
          url,
          area: "customer",
          expiresInMinutes: MAGIC_LINK_MINUTES,
        }),
    }),
    ...(isGoogleSignInEnabled
      ? [
          Google({
            clientId: serverEnv.AUTH_GOOGLE_ID,
            clientSecret: serverEnv.AUTH_GOOGLE_SECRET,
            // Google verifies email ownership (checked in signIn), so let a
            // customer who first used a magic link also use Google.
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    Passkey({
      // Never create an account from a passkey alone: that would let anyone
      // claim an email address without proving they own it. Passkeys are
      // added from /account after signing in another way.
      getUserInfo: async () => null,
    }),
  ],
  pages: {
    signIn: "/sign-in",
    verifyRequest: "/sign-in/check-email",
    error: "/sign-in",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      return checkCustomerSignIn(db, {
        email: user.email,
        provider: account?.provider,
        emailVerified: (profile as { email_verified?: boolean } | undefined)?.email_verified,
      });
    },
    session({ session, user }) {
      return { ...session, user: { ...session.user, id: user.id } };
    },
  },
  events: {
    async signIn({ user, account, isNewUser }) {
      await logSignIn(db, {
        area: "customer",
        userId: user.id,
        provider: account?.provider,
        isNewUser,
        meta: await getRequestMeta(),
      });
    },
    async signOut(message) {
      const userId = "session" in message ? message.session?.userId : undefined;
      await logSignOut(db, { area: "customer", userId, meta: await getRequestMeta() });
    },
  },
});
