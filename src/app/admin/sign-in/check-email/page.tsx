import { MailCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AdminAuthShell } from "@/app/admin/_components/admin-auth-shell";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Check your email" };

/**
 * Shown after every staff email request, whether or not the address has a
 * staff account, so the form can't be used to find out who works here.
 */
export default function StaffCheckEmailPage() {
  return (
    <AdminAuthShell>
      <AuthCard
        title="Check your email"
        description="If that address has a staff account, we’ve sent a sign-in link. It expires in 10 minutes."
      >
        <MailCheckIcon className="size-10 text-primary" aria-hidden />
        <Button asChild variant="outline">
          <Link href="/admin/sign-in">Back to sign in</Link>
        </Button>
      </AuthCard>
    </AdminAuthShell>
  );
}
