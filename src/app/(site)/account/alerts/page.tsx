import type { Metadata } from "next";

import { requireCustomer } from "@/auth/guards";
import { ActionForm, SubmitButton } from "@/components/account/action-form";
import { AccountPage } from "@/components/account/account-page";
import { PriceAlertForm } from "@/components/account/forms";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { listAlertModels, listPriceAlerts, listStockAlerts } from "@/lib/account/alerts";
import { formatDate, formatPrice } from "@/lib/format";

import { stopStockAlertAction, updatePriceAlertAction } from "../actions";

export const metadata: Metadata = {
  title: "Alerts",
  robots: { index: false, follow: false },
};

export default function AlertsPage() {
  return (
    <AccountPage
      title="Alerts"
      href="/account/alerts"
      intro="Get an email when a phone drops to your price, when our trade-in offer reaches yours, or when a phone is back in stock."
    >
      <Alerts />
    </AccountPage>
  );
}

async function Alerts() {
  const user = await requireCustomer("/account/alerts");
  const [priceAlerts, stockAlerts, models] = await Promise.all([
    listPriceAlerts(db, user.id),
    listStockAlerts(db, user.email!),
    listAlertModels(db),
  ]);
  return (
    <div className="mt-6 flex flex-col gap-6">
      <section aria-labelledby="price-alerts" className="rounded-2xl border p-6">
        <h2 id="price-alerts" className="text-lg font-semibold">
          Price alerts
        </h2>
        {priceAlerts.length ? (
          <ul className="mt-4 divide-y">
            {priceAlerts.map((a) => {
              const what =
                a.type === "shop"
                  ? `Refurbished ${a.model}${a.grade ? ` (grade ${a.grade})` : ""} at ${formatPrice(a.targetPricePence)} or less`
                  : `Trade-in offer for ${a.model} of ${formatPrice(a.targetPricePence)} or more`;
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{what}</p>
                    <p className="text-sm text-muted-foreground">
                      {a.isActive ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="outline">Paused</Badge>
                      )}
                      {a.lastNotifiedAt ? ` Last emailed ${formatDate(a.lastNotifiedAt)}` : ""}
                    </p>
                  </div>
                  <ActionForm action={updatePriceAlertAction} label={`Manage alert: ${what}`}>
                    <input type="hidden" name="id" value={a.id} />
                    <div className="flex gap-2">
                      <SubmitButton
                        name="op"
                        value={a.isActive ? "pause" : "resume"}
                        variant="outline"
                        pendingText="Saving…"
                      >
                        {a.isActive ? "Pause" : "Resume"}
                        <span className="sr-only"> alert: {what}</span>
                      </SubmitButton>
                      <SubmitButton
                        name="op"
                        value="delete"
                        variant="ghost"
                        pendingText="Deleting…"
                      >
                        Delete<span className="sr-only"> alert: {what}</span>
                      </SubmitButton>
                    </div>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No price alerts yet.</p>
        )}
        <div className="mt-6 border-t pt-6">
          <h3 className="mb-4 font-semibold">New price alert</h3>
          <PriceAlertForm models={models} />
        </div>
      </section>

      <section aria-labelledby="stock-alerts" className="rounded-2xl border p-6">
        <h2 id="stock-alerts" className="text-lg font-semibold">
          Back in stock alerts
        </h2>
        {stockAlerts.length ? (
          <ul className="mt-4 divide-y">
            {stockAlerts.map((a) => {
              const what = `${a.model}${a.storageGb ? ` ${a.storageGb}GB` : ""}`;
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <p>
                    <span className="font-medium">{what}</span>
                    <span className="block text-sm text-muted-foreground">
                      Since {formatDate(a.createdAt)}
                    </span>
                  </p>
                  <ActionForm action={stopStockAlertAction} label={`Stop alert for ${what}`}>
                    <input type="hidden" name="id" value={a.id} />
                    <SubmitButton variant="ghost" pendingText="Stopping…">
                      Stop<span className="sr-only"> alert for {what}</span>
                    </SubmitButton>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            None. You can ask to be told when a sold phone is back in stock from its page.
          </p>
        )}
      </section>
    </div>
  );
}
