import { BanknoteIcon, PackageIcon, SearchIcon } from "lucide-react";

import { Reveal } from "@/components/motion/reveal";
import { howItWorks } from "@/content/home";

import { SectionHeading } from "./section-heading";

const icons = [SearchIcon, PackageIcon, BanknoteIcon];

export function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="py-(--spacing-section)">
      <div className="page-container">
        <SectionHeading
          id="how-heading"
          eyebrow="How it works"
          title="Sell in three simple steps"
        />
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {howItWorks.map((step, index) => {
            const Icon = icons[index]!;
            return (
              <Reveal
                as="li"
                key={step.title}
                delay={index * 0.1}
                className="relative rounded-2xl border bg-card p-6"
              >
                <span
                  aria-hidden
                  className="absolute top-6 right-6 text-5xl font-semibold text-muted-foreground/25 tabular-nums"
                >
                  {index + 1}
                </span>
                <Icon className="size-8 text-primary" aria-hidden />
                <h3 className="mt-4 text-xl font-semibold">
                  <span className="sr-only">Step {index + 1}: </span>
                  {step.title}
                </h3>
                <p className="mt-2 text-muted-foreground">{step.body}</p>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
