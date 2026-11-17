import { LogOutIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { signOutCustomer } from "@/app/(site)/sign-in/actions";
import { requireCustomer } from "@/auth/guards";
import { FormMessage } from "@/components/auth/auth-card";
import { AddPasskeyButton } from "@/components/auth/customer-passkey-buttons";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <div className="page-container py-8">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Your account", href: "/account" },
        ]}
      />
      <h1 className="mt-6 text-3xl font-semibold">Your account</h1>
      <Suspense fallback={<Skeleton className="mt-6 h-48 w-full max-w-xl" />}>
        <AccountContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AccountContent({ searchParams }: Pick<PageProps<"/account">, "searchParams">) {
  // Server-side check: the proxy only looks for a cookie.
  const user = await requireCustomer("/account");
  const { passkey } = await searchParams;

  return (
    <div className="mt-6 grid max-w-xl gap-6">
      {passkey === "added" ? (
        <FormMessage tone="info">Passkey added. You can now sign in with it.</FormMessage>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-lg font-semibold">Your details</h2>
          </CardTitle>
          <CardDescription>Signed in as {user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signOutCustomer}>
            <Button type="submit" variant="outline">
              <LogOutIcon aria-hidden />
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-lg font-semibold">Passkeys</h2>
          </CardTitle>
          <CardDescription>
            Sign in with your fingerprint, face or screen lock instead of an email link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddPasskeyButton />
        </CardContent>
      </Card>
    </div>
  );
}
