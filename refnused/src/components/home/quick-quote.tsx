import { connection } from "next/server";
import { Suspense } from "react";

import { AnimatedNumber } from "@/components/motion/animated-number";
import { Skeleton } from "@/components/ui/skeleton";
import { loadQuoteStats } from "@/lib/catalogue/queries";

import { QuickQuoteSearch } from "./quick-quote-search";
import { SectionHeading } from "./section-heading";

export function QuickQuote() {
  return (
    <section
      id="quick-quote"
      aria-labelledby="quick-quote-heading"
      className="scroll-mt-(--spacing-header) border-y bg-muted/40 py-(--spacing-section)"
    >
      <div className="page-container grid items-center gap-10 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <SectionHeading
            id="quick-quote-heading"
            eyebrow="Sell your phone"
            title="What’s your phone worth?"
            intro="Search for your model to see what we’ll pay. It takes seconds and there’s no obligation."
          />
          <QuickQuoteSearch />
        </div>
        <Suspense fallback={<StatsSkeleton />}>
          <QuoteStats />
        </Suspense>
      </div>
    </section>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid h-36 grid-cols-3 gap-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-full rounded-2xl" />
      ))}
    </div>
  );
}

async function QuoteStats() {
  await connection();
  const stats = await loadQuoteStats();
  if (!stats || stats.models === 0) return <div className="h-36" aria-hidden />;

  const items = [
    stats.maxTradeInPence
      ? {
          value: Math.floor(stats.maxTradeInPence / 100),
          format: "gbp-whole" as const,
          label: "Our top price right now",
        }
      : null,
    { value: stats.models, format: "integer" as const, label: "Models with instant prices" },
    {
      value: stats.stores,
      format: "integer" as const,
      label: stats.stores === 1 ? "Local store" : "Local stores",
    },
  ].filter((item) => item !== null);

  return (
    <dl className="grid h-36 grid-cols-3 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-col-reverse justify-center gap-1 rounded-2xl border bg-card p-4 text-center"
        >
          <dt className="text-sm text-muted-foreground">{item.label}</dt>
          <dd className="text-2xl font-semibold sm:text-3xl">
            <AnimatedNumber value={item.value} format={item.format} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
