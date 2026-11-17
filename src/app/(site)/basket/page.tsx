import { TrashIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { BasketChanged } from "@/components/checkout/order-status-refresher";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { formatPrice } from "@/lib/format";
import { getBasketLines } from "@/lib/orders/checkout-service";
import { readBasket, readCheckoutToken } from "@/lib/orders/cookies";
import { calculateOrderTotals } from "@/lib/orders/totals";

import { removeFromBasketAction } from "./actions";

export const metadata: Metadata = {
  title: "Your basket",
  description: "The refurbished phones in your basket.",
  alternates: { canonical: "/basket" },
  robots: { index: false, follow: true },
};

export default function BasketPage() {
  return (
    <div className="page-container max-w-4xl py-8">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Basket", href: "/basket" },
        ]}
      />
      <h1 className="mt-6 text-4xl font-semibold">Your basket</h1>
      <Suspense fallback={<Skeleton className="mt-8 h-64 rounded-2xl" />}>
        <BasketContents />
      </Suspense>
    </div>
  );
}

async function BasketContents() {
  // Prices and holds are checked against the current time on every request.
  await connection();
  const lines = await getBasketLines(db, await readBasket(), {
    accessToken: await readCheckoutToken(),
  });

  if (lines.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border bg-muted/40 p-8 text-center">
        <BasketChanged count={0} />
        <p className="font-medium">Your basket is empty.</p>
        <Button asChild className="mt-4 min-h-11">
          <Link href="/shop">Browse refurbished phones</Link>
        </Button>
      </div>
    );
  }

  const available = lines.filter((l) => l.available);
  const subtotal = available.length
    ? calculateOrderTotals({
        itemPricesPence: available.map((l) => l.pricePence),
        deliveryPence: 0,
      }).subtotalPence
    : 0;

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
      <BasketChanged count={lines.length} />
      <ul className="divide-y rounded-2xl border">
        {lines.map((line) => (
          <li key={line.productId} className="flex flex-wrap items-center gap-4 p-4 sm:p-6">
            <div className="min-w-0 flex-1">
              <Link
                href={`/shop/${line.brandSlug}/${line.slug}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {line.description}
              </Link>
              <p className="text-sm text-muted-foreground">
                {line.warrantyMonths}-month warranty · at {line.storeName}
              </p>
              {line.available ? null : (
                <p className="mt-1 text-sm font-medium text-destructive">
                  No longer available. Please remove it.
                </p>
              )}
            </div>
            <p className="font-semibold">{formatPrice(line.pricePence)}</p>
            <form action={removeFromBasketAction}>
              <input type="hidden" name="productId" value={line.productId} />
              <button
                type="submit"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <TrashIcon className="size-4" aria-hidden />
                Remove<span className="sr-only"> {line.description}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
      <aside aria-labelledby="basket-summary" className="h-fit rounded-2xl border p-6">
        <h2 id="basket-summary" className="text-lg font-semibold">
          Summary
        </h2>
        <dl className="mt-4 flex justify-between">
          <dt>Subtotal</dt>
          <dd className="font-semibold" data-testid="basket-subtotal">
            {formatPrice(subtotal)}
          </dd>
        </dl>
        <p className="mt-2 text-sm text-muted-foreground">
          Delivery and any trade-in credit are worked out at checkout, before you pay.
        </p>
        {available.length === lines.length ? (
          <Button asChild className="mt-6 min-h-11 w-full">
            <Link href="/checkout">Checkout</Link>
          </Button>
        ) : (
          <p className="mt-6 text-sm font-medium">Remove unavailable phones to check out.</p>
        )}
      </aside>
    </div>
  );
}
