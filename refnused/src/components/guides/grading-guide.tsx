import { CheckIcon } from "lucide-react";
import Link from "next/link";

import { GradeBadge } from "@/components/ui/badge";
import { gradingGuide } from "@/content/guides";
import { GRADE_INFO, GRADES } from "@refnused/database/lib/grades";
import { EMPTY_FILTERS, shopHref } from "@refnused/database/lib/shop/filters";
import { batteryRating, TRADE_IN_CONDITIONS } from "@refnused/database/lib/shop/product-info";

const linkClass = "font-medium text-primary underline underline-offset-4";

/** Battery bands, labelled by batteryRating() so the guide matches every listing. */
const BATTERY_BANDS = [
  { range: "95–100%", sample: 95 },
  { range: "90–94%", sample: 90 },
  { range: "85–89%", sample: 85 },
  { range: "80–84%", sample: 80 },
  { range: "Below 80%", sample: 79 },
].map((band) => ({ ...band, ...batteryRating(band.sample) }));

/** "Grading explained": grades from src/lib/grades.ts, so the guide can't drift from the shop. */
export function GradingGuide() {
  return (
    <>
      <p className="mt-8 text-lg">{gradingGuide.intro}</p>

      <section aria-labelledby="grades-heading" className="mt-10">
        <h2 id="grades-heading" className="text-2xl font-semibold">
          Refurbished grades
        </h2>
        <ul className="mt-4 grid gap-4 md:grid-cols-3">
          {GRADES.map((g) => (
            <li key={g} className="flex flex-col rounded-2xl border p-5">
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <GradeBadge grade={g} /> {GRADE_INFO[g].label}
              </h3>
              <p className="mt-2 text-muted-foreground">{GRADE_INFO[g].description}</p>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="font-medium">Screen</dt>
                <dd className="text-muted-foreground">{GRADE_INFO[g].details.screen}</dd>
                <dt className="font-medium">Body</dt>
                <dd className="text-muted-foreground">{GRADE_INFO[g].details.body}</dd>
              </dl>
              <Link
                href={shopHref({ ...EMPTY_FILTERS, grades: [g] })}
                className={`mt-auto inline-flex min-h-11 items-center pt-3 ${linkClass}`}
              >
                Shop Grade {g} phones
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="every-grade-heading" className="mt-10">
        <h2 id="every-grade-heading" className="text-2xl font-semibold">
          Every grade, every phone
        </h2>
        <ul className="mt-4 space-y-2">
          {gradingGuide.everyGrade.map((point) => (
            <li key={point} className="flex gap-2">
              <CheckIcon className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
              {point}
            </li>
          ))}
        </ul>
        <p className="mt-3">
          <Link href="/warranty" className={linkClass}>
            Warranty details
          </Link>
        </p>
      </section>

      <section aria-labelledby="battery-heading" className="mt-10">
        <h2 id="battery-heading" className="text-2xl font-semibold">
          Battery health
        </h2>
        <p className="mt-3">{gradingGuide.batteryIntro}</p>
        <div className="mt-4 overflow-x-auto rounded-2xl border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">What each battery health rating means</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="p-3 font-semibold">
                  Battery health
                </th>
                <th scope="col" className="p-3 font-semibold">
                  Rating
                </th>
                <th scope="col" className="p-3 font-semibold">
                  What to expect
                </th>
              </tr>
            </thead>
            <tbody>
              {BATTERY_BANDS.map((band) => (
                <tr key={band.range} className="border-t">
                  <th scope="row" className="p-3 font-medium whitespace-nowrap">
                    {band.range}
                  </th>
                  <td className="p-3">{band.label}</td>
                  <td className="p-3 text-muted-foreground">{band.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="trade-in-heading" className="mt-10">
        <h2 id="trade-in-heading" className="text-2xl font-semibold">
          How we grade phones you sell to us
        </h2>
        <p className="mt-3">{gradingGuide.tradeInIntro}</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {TRADE_IN_CONDITIONS.map((c) => (
            <div key={c.key} className="rounded-2xl border p-4">
              <dt className="font-semibold">{c.label}</dt>
              <dd className="text-sm text-muted-foreground">{c.description}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4">
          <Link href="/sell" className={linkClass}>
            Get an instant quote for your phone
          </Link>
        </p>
      </section>
    </>
  );
}
