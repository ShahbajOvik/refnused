import type { Metadata } from "next";
import { Suspense } from "react";

import { safeCallbackUrl } from "@/auth/access";
import { AuthCard, AuthCardSkeleton, Divider, FormMessage } from "@/components/auth/auth-card";
import { PasskeySignInButton } from "@/components/auth/customer-passkey-buttons";
import { EmailSignInForm } from "@/components/auth/email-sign-in-form";
import { GoogleIcon } from "@/components/auth/google-icon";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { Button } from "@/components/ui/button";
import { isGoogleSignInEnabled } from "@/lib/env.server";

import { signInWithEmail, signInWithGoogle } from "./actions";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to track your trade-ins and orders.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/sign-in" },
};

const ERRORS: Record<string, string> = {
  Verification: "That sign-in link has expired or has already been used. Request a new one.",
  AccessDenied: "You can't sign in with that account. Contact us if you need help.",
  OAuthAccountNotLinked: "That email is already linked to another sign-in method.",
  Configuration: "Sign-in isn't working right now. Please try again later.",
};

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <div className="page-container py-8">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Sign in", href: "/sign-in" },
        ]}
      />
      <div className="py-10">
        <Suspense fallback={<AuthCardSkeleton />}>
          <SignInContent searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function SignInContent({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl, "/account");
  const errorCode = typeof params.error === "string" ? params.error : undefined;
  const error = errorCode
    ? (ERRORS[errorCode] ?? "Something went wrong. Please try again.")
    : undefined;

  return (
    <AuthCard
      title="Sign in"
      description="Track your trade-ins and orders. New here? We’ll create your account when you sign in."
    >
      {error ? <FormMessage>{error}</FormMessage> : null}
      <EmailSignInForm action={signInWithEmail} callbackUrl={callbackUrl} />
      <Divider />
      {isGoogleSignInEnabled ? (
        <form action={signInWithGoogle}>
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <Button type="submit" variant="outline" size="lg" className="w-full">
            <GoogleIcon />
            Continue with Google
          </Button>
        </form>
      ) : null}
      <PasskeySignInButton callbackUrl={callbackUrl} />
    </AuthCard>
  );
}
