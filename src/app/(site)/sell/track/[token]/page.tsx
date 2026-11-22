import { CheckIcon, MapPinIcon, PhoneIcon, PrinterIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { InstallBanner } from "@/components/pwa/install-banner";
import { PushOptIn } from "@/components/pwa/push-opt-in";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { publicEnv } from "@/lib/env";
import { formatDate, formatPrice, telHref } from "@/lib/format";
import { getQuoteByTrackingToken, type TrackedQuote } from "@/lib/sell/quote-service";
import { cn } from "@/lib/utils";

// The URL contains a secret: never index it or leak it in the Referer header.
export const metadata: Metadata = {
  title: "Track your trade-in",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

const STAGES = [
  { key: "accepted", label: "Quote accepted" },
  { key: "received", label: "Phone received" },
  { key: "inspecting", label: "Checking your phone" },
  { key: "approved", label: "Approved for payment" },
  { key: "paid", label: "Paid" },
] as const;

const STAGE_INDEX: Record<string, number> = {
  accepted: 0,
  received: 1,
  inspecting: 2,
  revised: 2,
  approved: 3,
  paid: 4,
};

export default function TrackPage({ params }: PageProps<"/sell/track/[token]">) {
  return (
    <div className="page-container max-w-3xl py-10">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Tracking params={params} />
      </Suspense>
    </div>
  );
}

async function Tracking({ params }: Pick<PageProps<"/sell/track/[token]">, "params">) {
  await connection();
  const { token } = await params;
  const quote = await getQuoteByTrackingToken(db, token);
  if (!quote) notFound();
  const current = STAGE_INDEX[quote.status] ?? -1;
  const inProgress = quote.status in STAGE_INDEX && quote.status !== "paid";

  return (
    <>
      <p className="text-sm font-medium text-primary">Reference {quote.reference}</p>
      <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">
        {quote.status === "accepted" ? "Thanks, your quote is confirmed" : "Your trade-in"}
      </h1>
      <p className="mt-2 text-muted-foreground">
        We’ve emailed you a copy. Keep this page: it’s your link to track progress.
      </p>

      <dl className="mt-6 grid gap-4 rounded-2xl border bg-card p-6 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted-foreground">Phone</dt>
          <dd className="font-medium">
            {quote.brand} {quote.model}, {quote.storageGb}GB, {quote.colour}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Our offer</dt>
          <dd className="text-2xl font-semibold" data-testid="tracked-offer">
            {formatPrice(quote.offeredPricePence)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Price locked until</dt>
          <dd className="font-medium">{formatDate(quote.priceLockedUntil)}</dd>
        </div>
      </dl>

      {quote.status === "accepted" ? (
        <NextSteps quote={quote} token={(await params).token} />
      ) : null}

      <section aria-labelledby="progress-heading" className="mt-8">
        <h2 id="progress-heading" className="text-xl font-semibold">
          Progress
        </h2>
        {quote.status === "revised" ? (
          <p className="mt-2 rounded-xl border border-warning bg-warning/20 p-3 text-sm">
            We’ve sent you a revised offer by email. Please accept or decline it.
          </p>
        ) : null}
        {["rejected", "returned", "expired", "cancelled"].includes(quote.status) ? (
          <p className="mt-2 rounded-xl border p-3 text-sm">
            This quote is {quote.status}. Contact us if you have any questions.
          </p>
        ) : null}
        <ol className="mt-4 flex flex-col gap-3">
          {STAGES.map((stage, index) => {
            const done = index <= current;
            return (
              <li key={stage.key} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full border-2",
                    done
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {done ? <CheckIcon className="size-4" aria-hidden /> : index + 1}
                </span>
                <span className={done ? "font-medium" : "text-muted-foreground"}>
                  {stage.label}
                  <span className="sr-only">{done ? " (done)" : " (not yet)"}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {inProgress ? (
        <PushOptIn
          topic={{ kind: "quote", token }}
          vapidPublicKey={publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY}
          heading="Get updates on this device"
          description="We’ll let you know when your phone arrives, when we’ve checked it and when you’ve been paid. We’ll still email you."
        />
      ) : null}
      {quote.status === "accepted" ? <InstallBanner context="quote" /> : null}
    </>
  );
}

function NextSteps({ quote, token }: { quote: TrackedQuote; token: string }) {
  return (
    <section aria-labelledby="next-heading" className="mt-8 rounded-2xl bg-muted/50 p-6">
      <h2 id="next-heading" className="text-xl font-semibold">
        What to do next
      </h2>
      {quote.deliveryMethod === "store_drop_off" && quote.storeName ? (
        <div className="mt-3 flex flex-col gap-2">
          <p>Bring your phone to:</p>
          <p className="flex items-start gap-2 font-medium">
            <MapPinIcon className="mt-0.5 size-4 text-primary" aria-hidden />
            {quote.storeName}, {quote.storeStreet}, {quote.storeTown} {quote.storePostcode}
          </p>
          {quote.storePhone ? (
            <a
              href={telHref(quote.storePhone)}
              className="flex items-center gap-2 text-primary underline-offset-4 hover:underline"
            >
              <PhoneIcon className="size-4" aria-hidden /> Call the store
            </a>
          ) : null}
        </div>
      ) : quote.deliveryMethod === "print_label" ? (
        <div className="mt-3 flex flex-col items-start gap-3">
          <p>Print your label, pack your phone securely and post it.</p>
          <Button asChild>
            <Link href={`/sell/track/${token}/label`}>
              <PrinterIcon aria-hidden /> Print label
            </Link>
          </Button>
        </div>
      ) : (
        <p className="mt-3">
          We’ll post a free pack to {quote.contactAddress?.line1}, {quote.contactAddress?.postcode}.
          Put your phone in it and send it back.
        </p>
      )}
      <p className="mt-4 text-sm text-muted-foreground">
        Before you send it: back up your phone, sign out of iCloud or your Google account, and reset
        it.
      </p>
    </section>
  );
}
