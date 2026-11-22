import { MailCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Check your email",
  robots: { index: false, follow: false },
};

export default function CheckEmailPage() {
  return (
    <div className="page-container py-16">
      <AuthCard
        title="Check your email"
        description="We’ve sent you a sign-in link. It works once and expires in 30 minutes."
      >
        <MailCheckIcon className="size-10 text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Can’t see it? Check your spam or junk folder. You can close this tab; the link opens a new
          one.
        </p>
        <Button asChild variant="outline">
          <Link href="/sign-in">Use a different email</Link>
        </Button>
      </AuthCard>
    </div>
  );
}
