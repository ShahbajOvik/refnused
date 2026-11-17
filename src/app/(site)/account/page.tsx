import { LogOutIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { signOutCustomer } from "@/app/(site)/sign-in/actions";
import { requireCustomer } from "@/auth/guards";
import { FormMessage } from "@/components/auth/auth-card";
import { AddPasskeyButton } from "@/components/auth/customer-passkey-buttons";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { listPriceAlerts } from "@/lib/account/alerts";
import { isQuoteInProgress, listCustomerQuotes } from "@/lib/account/quotes";
import { listCustomerOrders } from "@/lib/orders/order-service";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Your account", href: "/account" },
        ]}
      />
      <h1 className="mt-6 text-3xl font-semibold">Your account</h1>
      <Suspense fallback={<Skeleton className="mt-6 h-64 w-full" />}>
        <Overview searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const cardClass = "rounded-2xl border p-6";

async function Overview({ searchParams }: Pick<PageProps<"/account">, "searchParams">) {
  // Server-side check: the proxy only looks for a cookie.
  const user = await requireCustomer("/account");
  const [{ passkey }, quotes, orders, alerts] = await Promise.all([
    searchParams,
    listCustomerQuotes(db, user.id),
    listCustomerOrders(db, user.id),
    listPriceAlerts(db, user.id),
  ]);
  const openQuotes = quotes.filter((q) => isQuoteInProgress(q.status));
  const offersToAnswer = quotes.filter((q) => q.inspection?.revisedOfferStatus === "pending");
  const activeOrders = orders.filter((o) =>
    ["paid", "processing", "dispatched", "ready_for_collection"].includes(o.status),
  );

  const summaries = [
    {
      href: "/account/quotes",
      title: "Trade-ins",
      text: offersToAnswer.length
        ? `${offersToAnswer.length} revised ${offersToAnswer.length === 1 ? "offer needs" : "offers need"} your answer`
        : `${openQuotes.length} in progress`,
      urgent: offersToAnswer.length > 0,
    },
    {
      href: "/account/orders",
      title: "Orders",
      text: `${activeOrders.length} on the way or ready to collect`,
    },
    {
      href: "/account/alerts",
      title: "Alerts",
      text: `${alerts.filter((a) => a.isActive).length} active price alerts`,
    },
  ];

  return (
    <div className="mt-6 flex flex-col gap-6">
      {passkey === "added" ? (
        <FormMessage tone="info">Passkey added. You can now sign in with it.</FormMessage>
      ) : null}
      <ul className="grid gap-4 sm:grid-cols-3">
        {summaries.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="flex h-full flex-col gap-1 rounded-2xl border p-5 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[urgent]:border-primary"
              data-urgent={s.urgent || undefined}
            >
              <span className="font-semibold">{s.title}</span>
              <span className="text-sm text-muted-foreground">{s.text}</span>
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="details-heading" className={cardClass}>
        <h2 id="details-heading" className="text-lg font-semibold">
          Your details
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Signed in as {user.email}</p>
        <form action={signOutCustomer} className="mt-4">
          <Button type="submit" variant="outline" className="min-h-11">
            <LogOutIcon aria-hidden />
            Sign out
          </Button>
        </form>
      </section>

      <section aria-labelledby="passkeys-heading" className={cardClass}>
        <h2 id="passkeys-heading" className="text-lg font-semibold">
          Passkeys
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in with your fingerprint, face or screen lock instead of an email link.
        </p>
        <div className="mt-4">
          <AddPasskeyButton />
        </div>
      </section>
    </div>
  );
}
