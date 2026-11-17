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
import { customers, stores } from "@/db/schema";
import { customerAuth } from "@/auth/customer";
import { listAddresses } from "@/lib/account/addresses";
import { publicEnv } from "@/lib/env";
import { previewCheckout } from "@/lib/orders/checkout-service";
import { readBasket, readCheckoutToken } from "@/lib/orders/cookies";

/** +447700900123 → 07700 900123, for the phone field. */
function formatUkPhone(e164: string | null) {
  if (!e164) return null;
  return e164.startsWith("+44") ? `0${e164.slice(3, 7)} ${e164.slice(7)}` : e164;
}

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
  const [productIds, accessToken, session] = await Promise.all([
    readBasket(),
    readCheckoutToken(),
    customerAuth(),
  ]);
  const customerId = session?.user?.id;
  const [customer] = customerId
    ? await db
        .select({ email: customers.email, name: customers.name, phone: customers.phone })
        .from(customers)
        .where(eq(customers.id, customerId))
    : [];
  const savedAddresses = customerId ? await listAddresses(db, customerId) : [];
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
      .orderBy(stores.name, stores.town),
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
      prefill={
        customer
          ? { email: customer.email, name: customer.name, phone: formatUkPhone(customer.phone) }
          : undefined
      }
      savedAddresses={savedAddresses}
    />
  );
}
