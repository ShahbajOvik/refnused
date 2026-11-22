import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { howItWorks } from "@/content/home";
import { formatDate, formatPrice } from "@refnused/database/lib/format";
import type { ModelValueContent } from "@/lib/guides/queries";
import {
  guidePath,
  GRADING_GUIDE_SLUG,
  WIPE_GUIDE_SLUG,
} from "@refnused/database/lib/guides/slugs";
import { sellModelPath } from "@refnused/database/lib/internal-links";
import { TRADE_IN_GRADES, type TradeInGrade } from "@refnused/database/lib/sell/pricing";
import { TRADE_IN_CONDITIONS } from "@refnused/database/lib/shop/product-info";
import { storageLabel } from "@refnused/database/lib/shop/variant-label";

const CONDITION: Record<TradeInGrade, { label: string; description: string }> = Object.fromEntries(
  TRADE_IN_CONDITIONS.map((c) => [c.grade, { label: c.label, description: c.description }]),
) as Record<TradeInGrade, { label: string; description: string }>;

const linkClass = "font-medium text-primary underline underline-offset-4";

/**
 * "How much is my … worth?": live trade-in prices from trade_in_prices.
 * These are base prices (the most we pay), not an offer; the CTA goes to the
 * sell flow, which is the only place offers are made.
 */
export function ModelValueGuide({
  content,
  questionTitles,
}: {
  content: ModelValueContent;
  questionTitles: string[];
}) {
  const { model, table } = content;
  const phone = `${model.brandName} ${model.name}`;
  const sellPath = sellModelPath(model);
  const grades = TRADE_IN_GRADES.filter((g) => table.grades.includes(g));

  return (
    <>
      <section
        aria-labelledby="answer-heading"
        className="mt-8 rounded-2xl border bg-primary/5 p-6"
      >
        <h2 id="answer-heading" className="sr-only">
          The short answer
        </h2>
        {table.top ? (
          <p className="text-lg">
            Today we pay up to{" "}
            <strong className="text-2xl">
              {formatPrice(table.top.pricePence, { whole: true })}
            </strong>{" "}
            for a {phone} {storageLabel(table.top.storageGb)} in{" "}
            {CONDITION[table.top.grade].label.toLowerCase()} condition
            {table.lowestWorkingPence && table.lowestWorkingPence !== table.top.pricePence
              ? `, and from ${formatPrice(table.lowestWorkingPence, { whole: true })} for one that’s well used but working`
              : ""}
            .
          </p>
        ) : (
          <p className="text-lg">
            We’re not buying the {phone} online at the moment. Bring it in to a store for a price.
          </p>
        )}
        {table.updatedAt ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Prices checked{" "}
            <time dateTime={table.updatedAt.toISOString()}>{formatDate(table.updatedAt)}</time>.
            They can go up or down; your quote locks in your price.
          </p>
        ) : null}
        <Button asChild size="lg" className="mt-4">
          <Link href={sellPath}>
            Get your exact price <ArrowRightIcon aria-hidden />
          </Link>
        </Button>
      </section>

      <section aria-labelledby="prices-heading" className="mt-10">
        <h2 id="prices-heading" className="text-2xl font-semibold">
          {model.name} trade-in prices by storage and condition
        </h2>
        <div className="mt-4 overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">
              The most we pay for a {phone}, by storage (rows) and condition (columns)
            </caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="p-3 font-semibold">
                  Storage
                </th>
                {grades.map((g) => (
                  <th key={g} scope="col" className="p-3 text-right font-semibold">
                    {CONDITION[g].label}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {CONDITION[g].description}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row.storageGb} className="border-t">
                  <th scope="row" className="p-3 font-medium">
                    {storageLabel(row.storageGb)}
                  </th>
                  {grades.map((g) => (
                    <td key={g} className="p-3 text-right tabular-nums">
                      {row.prices[g] !== undefined ? (
                        formatPrice(row.prices[g], { whole: true })
                      ) : (
                        <span className="text-muted-foreground">
                          –<span className="sr-only">not available</span>
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          These are the most we pay for each storage and condition. They’re a guide, not an offer:
          your quote is worked out from your answers and is the price we honour.
        </p>
      </section>

      <section aria-labelledby="affects-heading" className="mt-10">
        <h2 id="affects-heading" className="text-2xl font-semibold">
          What changes the price of a {model.name}
        </h2>
        <p className="mt-3">
          Storage and condition make the biggest difference.{" "}
          <Link href={guidePath(GRADING_GUIDE_SLUG)} className={linkClass}>
            How we grade condition
          </Link>
          .{questionTitles.length ? " When you get a quote we’ll also ask:" : null}
        </p>
        {questionTitles.length ? (
          <ul className="mt-3 list-disc space-y-1 pl-6">
            {questionTitles.map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="how-heading" className="mt-10">
        <h2 id="how-heading" className="text-2xl font-semibold">
          How to sell your {model.name}
        </h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {howItWorks.map((step, i) => (
            <li key={step.title} className="rounded-2xl border p-5">
              <p className="text-sm font-semibold text-primary">Step {i + 1}</p>
              <h3 className="mt-1 font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4">
          Before you send it,{" "}
          <Link href={guidePath(WIPE_GUIDE_SLUG)} className={linkClass}>
            wipe your phone and sign out of your accounts
          </Link>
          .
        </p>
      </section>
    </>
  );
}
