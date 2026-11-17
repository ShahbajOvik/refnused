import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { RETENTION_NOTE } from "@/lib/account/privacy";

export const metadata: Metadata = {
  title: "Account deleted",
  description: "Your RefurbednUsed account has been deleted.",
  robots: { index: false, follow: false },
};

export default function AccountDeletedPage() {
  return (
    <div className="page-container max-w-2xl py-8">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Account deleted", href: "/account-deleted" },
        ]}
      />
      <h1 className="mt-6 text-3xl font-semibold">Your account has been deleted</h1>
      <p className="mt-3">
        We’ve signed you out everywhere and deleted your personal details. Thanks for using
        RefurbednUsed.
      </p>
      <p className="mt-3 text-sm text-muted-foreground">{RETENTION_NOTE}</p>
      <Link
        href="/"
        className="mt-6 inline-block font-medium text-primary underline underline-offset-4"
      >
        Back to the home page
      </Link>
    </div>
  );
}
