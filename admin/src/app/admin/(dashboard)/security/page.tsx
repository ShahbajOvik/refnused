import type { Metadata } from "next";
import { Suspense } from "react";

import { requireStaff } from "@/auth/guards";
import { PASSWORD_MIN_LENGTH } from "@refnused/database/auth/password";
import { staffHasPassword } from "@/auth/staff-password";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@refnused/database/db";

import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Security />
    </Suspense>
  );
}

async function Security() {
  const record = await requireStaff("admin.access", "/admin/security");
  const hasPassword = await staffHasPassword(db, record.staff.id);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-3xl font-semibold">Security</h1>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-lg font-semibold">Password</h2>
          </CardTitle>
          <CardDescription>
            {hasPassword
              ? "Sign in with your work email and this password."
              : "Set a password to sign in with your work email instead of an emailed link."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm hasPassword={hasPassword} minLength={PASSWORD_MIN_LENGTH} />
        </CardContent>
      </Card>
    </div>
  );
}
