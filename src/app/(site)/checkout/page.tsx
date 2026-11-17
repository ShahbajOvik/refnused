import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { toPreviewView } from "./preview-view";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DELIVERY_OPTIONS } from "@/config/shop";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { publicEnv } from "@/lib/env";
import { previewCheckout } from "@/lib/orders/checkout-service";
import { readBasket, readCheckoutToken } from "@/lib/orders/cookies";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Pay securely for your refurbished phone.",
  alternates: { canonical: "/checkout" },
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <div className="page-container py-8">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Basket", href: "/basket" },
          { label: "Checkout", href: "/checkout" },
        ]}
      />
      <h1 className="mt-6 text-4xl font-semibold">Checkout</h1>
      <Suspense fallback={<Skeleton className="mt-8 h-[36rem] rounded-2xl" />}>
        <Checkout />
      </Suspense>
    </div>
  );
}

async function Checkout() {
  // Prices and holds are checked against the current time on every request.
  await connection();
  const [productIds, accessToken] = await Promise.all([readBasket(), readCheckoutToken()]);
  const [result, storeRows] = await Promise.all([
    previewCheckout(db, {
      productIds,
      accessToken,
      fulfilment: { method: "delivery", deliveryOption: DELIVERY_OPTIONS[0]!.key },
    }),
    db
      .select({
        slug: stores.slug,
        name: stores.name,
        street: stores.street,
        town: stores.town,
        postcode: stores.postcode,
      })
      .from(stores)
      .where(eq(stores.isActive, true))
      .orderBy(stores.name),
  ]);

  if (!result.ok) {
    return (
      <div className="mt-8 rounded-2xl border bg-muted/40 p-8 text-center">
        <p className="font-medium">Your basket is empty.</p>
        <Button asChild className="mt-4 min-h-11">
          <Link href="/shop">Browse refurbished phones</Link>
        </Button>
      </div>
    );
  }
  if (result.preview.lines.some((l) => !l.available)) {
    return (
      <div className="mt-8 rounded-2xl border bg-muted/40 p-8 text-center">
        <p className="font-medium">A phone in your basket has just been reserved or sold.</p>
        <Button asChild className="mt-4 min-h-11">
          <Link href="/basket">Review your basket</Link>
        </Button>
      </div>
    );
  }

  return (
    <CheckoutForm
      initialPreview={toPreviewView(result.preview)}
      stores={storeRows}
      deliveryOptions={DELIVERY_OPTIONS}
      turnstileSiteKey={publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
      stripePublishableKey={publicEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
    />
  );
}
