import { DownloadIcon } from "lucide-react";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import Link from "next/link";

import { requireCustomer } from "@/auth/guards";
import { AccountPage } from "@/components/account/account-page";
import { DeleteAccountForm, MarketingForm } from "@/components/account/forms";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { deletionBlockers, RETENTION_NOTE, type DeletionBlocker } from "@/lib/account/privacy";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Privacy and your data",
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return (
    <AccountPage
      title="Privacy and your data"
      href="/account/privacy"
      intro="Choose what we send you, get a copy of your data, or delete your account."
    >
      <Privacy />
    </AccountPage>
  );
}

const BLOCKERS: Record<DeletionBlocker, { text: string; href: string }> = {
  trade_in_in_progress: { text: "A trade-in is still in progress", href: "/account/quotes" },
  order_in_progress: {
    text: "An order hasn’t been delivered or collected yet",
    href: "/account/orders",
  },
  open_return_or_claim: {
    text: "A return or warranty claim is still open",
    href: "/account/orders",
  },
  payout_pending: { text: "We still owe you a trade-in payment", href: "/account/quotes" },
};

async function Privacy() {
  const user = await requireCustomer("/account/privacy");
  const [[prefs], blockers] = await Promise.all([
    db
      .select({
        email: customers.marketingOptIn,
        sms: customers.marketingSmsOptIn,
        updatedAt: customers.marketingUpdatedAt,
      })
      .from(customers)
      .where(eq(customers.id, user.id)),
    deletionBlockers(db, user.id),
  ]);
  const card = "rounded-2xl border p-6";

  return (
    <div className="mt-6 flex flex-col gap-6">
      <section aria-labelledby="marketing" className={card}>
        <h2 id="marketing" className="text-lg font-semibold">
          Marketing
        </h2>
        {prefs?.updatedAt ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Last changed {formatDate(prefs.updatedAt)}
          </p>
        ) : null}
        <div className="mt-4">
          <MarketingForm email={prefs?.email ?? false} sms={prefs?.sms ?? false} />
        </div>
      </section>

      <section aria-labelledby="download" className={card}>
        <h2 id="download" className="text-lg font-semibold">
          Download your data
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A file (JSON) with your details, addresses, trade-ins, orders, alerts and account
          activity. Bank details are shown masked. This is your right of access under UK GDPR.
        </p>
        <a
          href="/account/export"
          download
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <DownloadIcon className="size-4" aria-hidden /> Download my data
        </a>
      </section>

      <section aria-labelledby="delete" className={`${card} border-destructive/40`}>
        <h2 id="delete" className="text-lg font-semibold">
          Delete your account
        </h2>
        <p className="mt-2 text-sm">
          This signs you out everywhere and deletes your details, addresses, payout details, alerts
          and passkeys. It can’t be undone.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{RETENTION_NOTE}</p>
        {blockers.length ? (
          <div className="mt-4 rounded-xl border bg-muted/40 p-4" role="note">
            <p className="font-medium">You can delete your account once these are finished:</p>
            <ul className="mt-2 flex list-disc flex-col gap-2 pl-5 text-sm">
              {blockers.map((b) => (
                <li key={b}>
                  <Link
                    href={BLOCKERS[b].href}
                    className="inline-flex min-h-6 items-center underline underline-offset-4"
                  >
                    {BLOCKERS[b].text}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="mt-4">
            <DeleteAccountForm email={user.email!} />
          </div>
        )}
      </section>
    </div>
  );
}
