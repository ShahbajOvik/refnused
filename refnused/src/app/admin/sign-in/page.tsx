import type { Metadata } from "next";
import { Suspense } from "react";

import { safeCallbackUrl } from "@/auth/access";
import { AdminAuthShell } from "@/app/admin/_components/admin-auth-shell";
import { StaffPasswordSignInForm } from "@/app/admin/_components/staff-password-sign-in-form";
import { AuthCard, AuthCardSkeleton, Divider, FormMessage } from "@/components/auth/auth-card";
import { EmailSignInForm } from "@/components/auth/email-sign-in-form";
import { GoogleIcon } from "@/components/auth/google-icon";
import { Button } from "@/components/ui/button";
import { publicEnv } from "@/lib/env";
import { isGoogleSignInEnabled } from "@/lib/env.server";

import {
  signInStaffWithEmail,
  signInStaffWithGoogle,
  signInStaffWithPasswordAction,
} from "./actions";

export const metadata: Metadata = { title: "Staff sign in" };

const REASONS: Record<string, string> = {
  idle: "You were signed out after 30 minutes without activity.",
  expired: "Your session has ended. Please sign in again.",
  inactive: "This staff account has been deactivated.",
  locked: "Too many incorrect codes. For your security, please sign in again.",
};

const ERRORS: Record<string, string> = {
  AccessDenied: "You can’t sign in with that account. Ask an owner to add you.",
  Verification: "That sign-in link has expired or has already been used.",
  OAuthAccountNotLinked: "That Google account can’t be used for this staff account.",
};

export default function StaffSignInPage({ searchParams }: PageProps<"/admin/sign-in">) {
  return (
    <AdminAuthShell>
      <Suspense fallback={<AuthCardSkeleton />}>
        <StaffSignIn searchParams={searchParams} />
      </Suspense>
    </AdminAuthShell>
  );
}

async function StaffSignIn({ searchParams }: Pick<PageProps<"/admin/sign-in">, "searchParams">) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl, "/admin");
  const reason = typeof params.reason === "string" ? REASONS[params.reason] : undefined;
  const error =
    typeof params.error === "string"
      ? (ERRORS[params.error] ?? "Something went wrong. Please try again.")
      : undefined;

  return (
    <AuthCard
      title="Staff sign in"
      description="After this step you’ll confirm it’s you with a passkey or your authenticator app."
    >
      {reason ? <FormMessage tone="info">{reason}</FormMessage> : null}
      {error ? <FormMessage>{error}</FormMessage> : null}
      <StaffPasswordSignInForm
        action={signInStaffWithPasswordAction}
        callbackUrl={callbackUrl}
        turnstileSiteKey={publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
      />
      <Divider label="or use a sign-in link" />
      <EmailSignInForm
        action={signInStaffWithEmail}
        callbackUrl={callbackUrl}
        turnstileSiteKey={publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        turnstileAction="staff_sign_in"
      />
      {isGoogleSignInEnabled ? (
        <>
          <Divider />
          <form action={signInStaffWithGoogle}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <Button type="submit" variant="outline" size="lg" className="w-full">
              <GoogleIcon />
              Continue with Google
            </Button>
          </form>
        </>
      ) : null}
    </AuthCard>
  );
}
