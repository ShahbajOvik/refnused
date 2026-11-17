import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { requireStaff } from "@/auth/guards";
import { PERMISSIONS, ROLE_LABELS, ROLE_PERMISSIONS } from "@/auth/roles";
import { FormMessage } from "@/components/auth/auth-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Dashboard" };

export default function AdminHomePage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<"/admin">, "searchParams">) {
  const record = await requireStaff("admin.access", "/admin");
  const { denied } = await searchParams;
  const { staff } = record;
  const permissions = PERMISSIONS.filter((p) => ROLE_PERMISSIONS[staff.role].has(p));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Hello, {staff.name}</h1>
      {denied ? (
        <FormMessage>
          You don’t have permission to open that page. Ask an owner if you need access.
        </FormMessage>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-lg font-semibold">Your access</h2>
            </CardTitle>
            <CardDescription>Role: {ROLE_LABELS[staff.role]}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2 text-sm">
              {permissions.map((p) => (
                <li key={p} className="rounded-full border px-2.5 py-0.5 font-mono text-xs">
                  {p}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-lg font-semibold">This session</h2>
            </CardTitle>
            <CardDescription>
              Verified with{" "}
              {record.mfaMethod === "passkey" ? "a passkey" : "your authenticator app"}. You’ll be
              signed out after 30 minutes without activity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/admin/security"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Manage two-step verification
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
