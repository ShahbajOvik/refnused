import type { Metadata } from "next";
import { Suspense } from "react";

import { TotpSetupPanel } from "@/app/admin/_components/totp-setup-panel";
import { PasskeyRegisterForm } from "@/app/admin/_components/two-factor-forms";
import { requireStaff } from "@/auth/guards";
import { PASSWORD_MIN_LENGTH } from "@/auth/password";
import { staffHasPassword } from "@/auth/staff-password";
import { listStaffPasskeys } from "@/auth/staff-passkeys";
import { FormMessage } from "@/components/auth/auth-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { formatDate } from "@/lib/format";

import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Security" };

export default function SecurityPage({ searchParams }: PageProps<"/admin/security">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Security searchParams={searchParams} />
    </Suspense>
  );
}

async function Security({ searchParams }: Pick<PageProps<"/admin/security">, "searchParams">) {
  const record = await requireStaff("admin.access", "/admin/security");
  const { added } = await searchParams;
  const [passkeys, hasPassword] = await Promise.all([
    listStaffPasskeys(db, record.staff.id),
    staffHasPassword(db, record.staff.id),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-3xl font-semibold">Security</h1>
      {added ? (
        <FormMessage tone="info">
          {added === "passkey" ? "Passkey added." : "Authenticator app turned on."}
        </FormMessage>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-lg font-semibold">Password</h2>
          </CardTitle>
          <CardDescription>
            {hasPassword
              ? "Sign in with your work email and this password, then two-step verification."
              : "Set a password to sign in with your work email instead of an emailed link."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm hasPassword={hasPassword} minLength={PASSWORD_MIN_LENGTH} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-lg font-semibold">Passkeys</h2>
          </CardTitle>
          <CardDescription>Add a passkey on each device you use for admin work.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {passkeys.length > 0 ? (
            <ul className="divide-y rounded-lg border text-sm">
              {passkeys.map((p) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-2 p-3">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-muted-foreground">
                    Added {formatDate(p.createdAt, "short")}
                    {p.lastUsedAt ? ` · last used ${formatDate(p.lastUsedAt, "short")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <PasskeyRegisterForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-lg font-semibold">Authenticator app</h2>
          </CardTitle>
          <CardDescription>
            {record.staff.hasTotp
              ? "Turned on. To move it to a new phone, ask an owner to reset your two-step verification."
              : "Use a 6-digit code from an app as a backup to your passkey."}
          </CardDescription>
        </CardHeader>
        {!record.staff.hasTotp ? (
          <CardContent>
            <TotpSetupPanel staffId={record.staff.id} email={record.staff.email} />
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
