import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { PrintButton } from "@/components/sell/print-button";
import { RECEIVING_STORE_SLUG, siteConfig } from "@refnused/database/config/site";
import { loadPublicStores } from "@/lib/stores-cache";
import { db } from "@refnused/database/db";
import { getQuoteByTrackingToken } from "@refnused/database/lib/sell/quote-service";

export const metadata: Metadata = {
  title: "Print your label",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

// TODO: confirm which store receives posted trade-ins, and replace this
// slip with a prepaid carrier label (e.g. Royal Mail Click & Drop API).

export default function LabelPage({ params }: PageProps<"/sell/track/[token]/label">) {
  return (
    <div className="page-container max-w-2xl py-10">
      <Suspense fallback={null}>
        <Label params={params} />
      </Suspense>
    </div>
  );
}

async function Label({ params }: Pick<PageProps<"/sell/track/[token]/label">, "params">) {
  const stores = await loadPublicStores();
  const RECEIVING_STORE = stores.find((st) => st.slug === RECEIVING_STORE_SLUG) ?? stores[0]!;
  await connection();
  const quote = await getQuoteByTrackingToken(db, (await params).token);
  if (!quote) notFound();

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
        <h1 className="text-2xl font-semibold">Your label</h1>
        <PrintButton />
      </div>
      <div className="rounded-xl border-2 border-dashed border-foreground p-8 font-mono text-lg print:border-solid">
        <p className="text-sm uppercase">Deliver to</p>
        <address className="mt-2 not-italic">
          {siteConfig.name} Trade-ins
          <br />
          c/o {RECEIVING_STORE.name}
          <br />
          {RECEIVING_STORE.address.street}
          <br />
          {RECEIVING_STORE.address.town}
          <br />
          <strong>{RECEIVING_STORE.address.postcode}</strong>
        </address>
        <p className="mt-6 text-sm uppercase">Reference</p>
        <p className="text-3xl font-bold tracking-widest">{quote.reference}</p>
        <p className="mt-4 text-sm">
          From: {quote.contactName}, {quote.contactAddress?.postcode}
        </p>
      </div>
      <p className="mt-4 text-sm text-muted-foreground print:hidden">
        Put a copy of your reference inside the package too. Use a tracked service and keep your
        proof of postage.
      </p>
    </>
  );
}
