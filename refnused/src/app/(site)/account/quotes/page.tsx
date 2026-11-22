import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm, SubmitButton } from "@/components/account/action-form";
import { AccountPage } from "@/components/account/account-page";
import { Timeline } from "@/components/account/timeline";
import { Badge } from "@/components/ui/badge";
import { requireCustomer } from "@/auth/guards";
import { db } from "@/db";
import { listCustomerQuotes, quoteTimeline, type QuoteSummary } from "@/lib/account/quotes";
import { formatDate, formatPrice } from "@/lib/format";

import { respondToOfferAction } from "../actions";

export const metadata: Metadata = {
  title: "Your trade-ins",
  robots: { index: false, follow: false },
};

export default function QuotesPage() {
  return (
    <AccountPage
      title="Your trade-ins"
      href="/account/quotes"
      intro="Track each phone you’re selling us, from your quote to payment."
    >
      <Quotes />
    </AccountPage>
  );
}

const STATUS_LABEL: Record<string, string> = {
  accepted: "Waiting for your phone",
  received: "Received",
  inspecting: "Being checked",
  revised: "Offer revised",
  approved: "Approved",
  paid: "Paid",
  returned: "Returned",
  rejected: "Not accepted",
  expired: "Expired",
  cancelled: "Cancelled",
};

async function Quotes() {
  const user = await requireCustomer("/account/quotes");
  const quotes = await listCustomerQuotes(db, user.id);
  if (quotes.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border bg-muted/40 p-8 text-center">
        <p className="font-medium">You haven’t sold us a phone yet.</p>
        <Link
          href="/sell"
          className="mt-2 inline-block font-medium text-primary underline underline-offset-4"
        >
          Get an instant quote
        </Link>
      </div>
    );
  }
  return (
    <ul className="mt-6 flex flex-col gap-6">
      {quotes.map((q) => (
        <li key={q.id}>
          <QuoteCard quote={q} />
        </li>
      ))}
    </ul>
  );
}

function QuoteCard({ quote: q }: { quote: QuoteSummary }) {
  const steps = quoteTimeline(q).map((step) =>
    step.key !== "revised"
      ? step
      : q.inspection?.revisedOfferStatus === "pending"
        ? { ...step, live: true, children: <RevisedOffer quote={q} /> }
        : { ...step, live: true },
  );
  return (
    <article aria-labelledby={`quote-${q.id}`} className="rounded-2xl border p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`quote-${q.id}`} className="text-lg font-semibold">
            {q.device}
          </h2>
          <p className="text-sm text-muted-foreground">
            {q.reference} · quoted {formatPrice(q.offeredPricePence)} on {formatDate(q.createdAt)}
          </p>
        </div>
        <Badge variant={q.inspection?.revisedOfferStatus === "pending" ? "warning" : "secondary"}>
          {STATUS_LABEL[q.status] ?? q.status}
        </Badge>
      </div>
      <Timeline steps={steps} label={`Progress of trade-in ${q.reference}`} />
    </article>
  );
}

function RevisedOffer({ quote: q }: { quote: QuoteSummary }) {
  const revised = q.inspection!.revisedPricePence!;
  return (
    <div className="rounded-xl border bg-muted/40 p-4">
      <p className="text-sm">
        We found something different from your answers
        {q.inspection?.notes ? `: ${q.inspection.notes}` : "."} Our new offer is{" "}
        <strong>{formatPrice(revised)}</strong> instead of {formatPrice(q.offeredPricePence)}.
      </p>
      <ActionForm
        action={respondToOfferAction}
        className="mt-3"
        label={`Answer the revised offer for ${q.reference}`}
      >
        <input type="hidden" name="quoteId" value={q.id} />
        <div className="flex flex-wrap gap-3">
          <SubmitButton name="decision" value="accept" pendingText="Accepting…">
            Accept {formatPrice(revised)}
          </SubmitButton>
          <SubmitButton name="decision" value="return" variant="outline" pendingText="Sending…">
            Send my phone back
          </SubmitButton>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Returning your phone is free of charge.
        </p>
      </ActionForm>
    </div>
  );
}
