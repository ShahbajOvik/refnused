import { ShieldCheckIcon } from "lucide-react";
import Link from "next/link";

import { wipeGuide } from "@/content/guides";

/** "How to wipe a phone": built-in steps (copy in src/content/guides.ts). */
export function WipeGuide() {
  return (
    <>
      <p className="mt-8 text-lg">{wipeGuide.intro}</p>
      <nav aria-label="On this page" className="mt-6 rounded-2xl border p-5">
        <h2 className="font-semibold">On this page</h2>
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
          {wipeGuide.sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {wipeGuide.sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          aria-labelledby={`${section.id}-heading`}
          className="mt-10 scroll-mt-24"
        >
          <h2 id={`${section.id}-heading`} className="text-2xl font-semibold">
            {section.title}
          </h2>
          <ol className="mt-4 list-decimal space-y-3 pl-6">
            {section.steps.map((step) => (
              <li key={step} className="leading-7">
                {step}
              </li>
            ))}
          </ol>
        </section>
      ))}
      <p className="mt-6 text-sm text-muted-foreground">{wipeGuide.note}</p>
      <section
        aria-labelledby="our-part-heading"
        className="mt-10 rounded-2xl border bg-primary/5 p-6"
      >
        <h2 id="our-part-heading" className="flex items-center gap-2 text-xl font-semibold">
          <ShieldCheckIcon className="size-5 text-primary" aria-hidden />
          What we do with your data
        </h2>
        <p className="mt-2">{wipeGuide.ourPart}</p>
        <p className="mt-3">
          Ready?{" "}
          <Link href="/sell" className="font-medium text-primary underline underline-offset-4">
            Get an instant quote for your phone
          </Link>
          .
        </p>
      </section>
    </>
  );
}
