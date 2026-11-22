import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminAuthShell } from "@/app/admin/_components/admin-auth-shell";
import { PasskeyVerifyButton, TotpVerifyForm } from "@/app/admin/_components/two-factor-forms";
import { signOutStaff } from "@/app/admin/sign-in/actions";
import { safeCallbackUrl } from "@/auth/access";
import { requireStaffAwaitingMfa } from "@/auth/guards";
import { AuthCard, AuthCardSkeleton, Divider } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Confirm it’s you" };

export default function VerifyPage({ searchParams }: PageProps<"/admin/verify">) {
  return (
    <AdminAuthShell>
      <Suspense fallback={<AuthCardSkeleton />}>
        <Verify searchParams={searchParams} />
      </Suspense>
    </AdminAuthShell>
  );
}

async function Verify({ searchParams }: Pick<PageProps<"/admin/verify">, "searchParams">) {
  const record = await requireStaffAwaitingMfa("mfa_required");
  const callbackUrl = safeCallbackUrl((await searchParams).callbackUrl, "/admin");
  const { passkeyCount, hasTotp } = record.staff;

  return (
    <AuthCard title="Confirm it’s you" description={`Signed in as ${record.staff.email}.`}>
      {passkeyCount > 0 ? <PasskeyVerifyButton callbackUrl={callbackUrl} /> : null}
      {passkeyCount > 0 && hasTotp ? <Divider /> : null}
      {hasTotp ? (
        <section aria-labelledby="totp-heading" className="flex flex-col gap-3">
          <h2 id="totp-heading" className="font-medium">
            Authenticator app
          </h2>
          <TotpVerifyForm callbackUrl={callbackUrl} />
        </section>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Lost your device? Ask an owner to reset your two-step verification.
      </p>
      <form action={signOutStaff}>
        <Button type="submit" variant="link">
          Sign out
        </Button>
      </form>
    </AuthCard>
  );
}
