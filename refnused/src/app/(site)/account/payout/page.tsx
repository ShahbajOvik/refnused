import { ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";

import { requireCustomer } from "@/auth/guards";
import { AccountPage } from "@/components/account/account-page";
import { PayoutChangeForm } from "@/components/account/forms";
import { db } from "@/db";
import { getPayoutSummary, maskSortCode } from "@/lib/account/payout";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Payout details",
  robots: { index: false, follow: false },
};

export default function PayoutPage() {
  return (
    <AccountPage
      title="Payout details"
      href="/account/payout"
      intro="The bank account we pay your trade-ins to. We only ever show the last few digits."
    >
      <Payout />
    </AccountPage>
  );
}

async function Payout() {
  const user = await requireCustomer("/account/payout");
  const { account, pendingPayouts } = await getPayoutSummary(db, user.id);
  return (
    <div className="mt-6 flex flex-col gap-6">
      <section aria-labelledby="current-payout" className="rounded-2xl border p-6">
        <h2 id="current-payout" className="text-lg font-semibold">
          Current account
        </h2>
        {account ? (
          <dl
            className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm"
            data-testid="payout-summary"
          >
            <dt className="text-muted-foreground">Sort code</dt>
            <dd>{maskSortCode(account.sortCodeLast2)}</dd>
            <dt className="text-muted-foreground">Account number</dt>
            <dd>Ending {account.accountNumberLast4}</dd>
            <dt className="text-muted-foreground">Confirmed</dt>
            <dd>{formatDate(account.verifiedAt)}</dd>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            You haven’t saved payout details yet. We’ll use the ones you give with each trade-in.
          </p>
        )}
        {pendingPayouts > 0 ? (
          <p className="mt-3 text-sm">
            {pendingPayouts} trade-in {pendingPayouts === 1 ? "payment is" : "payments are"} waiting
            to be paid.
          </p>
        ) : null}
      </section>
      <section aria-labelledby="change-payout" className="rounded-2xl border p-6">
        <h2 id="change-payout" className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheckIcon className="size-5 text-primary" aria-hidden />
          {account ? "Change payout details" : "Add payout details"}
        </h2>
        <div className="mt-3">
          <PayoutChangeForm email={user.email!} pendingPayouts={pendingPayouts} />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          We’ll email you whenever these details change. We never ask for your full bank details by
          phone, text or email.
        </p>
      </section>
    </div>
  );
}
