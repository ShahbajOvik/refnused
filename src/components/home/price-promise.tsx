import { BadgeCheckIcon } from "lucide-react";

import { Reveal } from "@/components/motion/reveal";
import { pricePromise } from "@/content/home";

/** Text only: no competitor logos, and no claims about competitors themselves. */
export function PricePromise() {
  return (
    <section aria-labelledby="promise-heading" className="py-(--spacing-section)">
      <div className="page-container">
        <Reveal className="rounded-3xl bg-primary px-6 py-10 text-primary-foreground sm:px-12 sm:py-14">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:gap-12">
            <div>
              <h2 id="promise-heading" className="text-3xl font-semibold sm:text-4xl">
                {pricePromise.title}
              </h2>
              <p className="mt-3 text-lg text-primary-foreground/90">{pricePromise.intro}</p>
            </div>
            <ul className="flex flex-col gap-4">
              {pricePromise.points.map((point) => (
                <li key={point} className="flex gap-3">
                  <BadgeCheckIcon className="mt-0.5 size-6 shrink-0" aria-hidden />
                  <span className="text-base sm:text-lg">{point}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-8 text-sm text-primary-foreground/85">{pricePromise.smallPrint}</p>
        </Reveal>
      </div>
    </section>
  );
}
