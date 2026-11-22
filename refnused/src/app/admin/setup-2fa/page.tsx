import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminAuthShell } from "@/app/admin/_components/admin-auth-shell";
import { TotpSetupPanel } from "@/app/admin/_components/totp-setup-panel";
import { PasskeyRegisterForm } from "@/app/admin/_components/two-factor-forms";
import { signOutStaff } from "@/app/admin/sign-in/actions";
import { safeCallbackUrl } from "@/auth/access";
import { requireStaffAwaitingMfa } from "@/auth/guards";
import { AuthCard, AuthCardSkeleton, Divider } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Set up two-step verification" };

export default function SetupTwoFactorPage({ searchParams }: PageProps<"/admin/setup-2fa">) {
  return (
    <AdminAuthShell>
      <Suspense fallback={<AuthCardSkeleton />}>
        <Setup searchParams={searchParams} />
      </Suspense>
    </AdminAuthShell>
  );
}

async function Setup({ searchParams }: Pick<PageProps<"/admin/setup-2fa">, "searchParams">) {
  const record = await requireStaffAwaitingMfa("mfa_setup_required");
  const callbackUrl = safeCallbackUrl((await searchParams).callbackUrl, "/admin");

  return (
    <AuthCard
      title="Set up two-step verification"
      description="Staff accounts need a second step at every sign-in. Choose a passkey (recommended) or an authenticator app."
    >
      <section aria-labelledby="passkey-heading" className="flex flex-col gap-3">
        <h2 id="passkey-heading" className="font-medium">
          Passkey (recommended)
        </h2>
        <p className="text-sm text-muted-foreground">
          Uses your fingerprint, face or device PIN. Nothing to type, and it can’t be phished.
        </p>
        <PasskeyRegisterForm callbackUrl={callbackUrl} />
      </section>
      <Divider />
      <section aria-labelledby="totp-heading" className="flex flex-col gap-3">
        <h2 id="totp-heading" className="font-medium">
          Authenticator app
        </h2>
        <TotpSetupPanel
          staffId={record.staff.id}
          email={record.staff.email}
          callbackUrl={callbackUrl}
        />
      </section>
      <form action={signOutStaff}>
        <Button type="submit" variant="link">
          Sign out
        </Button>
      </form>
    </AuthCard>
  );
}
