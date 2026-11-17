import { ChevronDownIcon } from "lucide-react";

import { faqs } from "@/content/home";

import { SectionHeading } from "./section-heading";

/** Native <details> accordion: accessible and needs no JavaScript. */
export function Faq() {
  return (
    <section aria-labelledby="faq-heading" className="py-(--spacing-section)">
      <div className="page-container grid gap-10 lg:grid-cols-[1fr_2fr]">
        <SectionHeading id="faq-heading" eyebrow="Help" title="Questions, answered" />
        <div className="divide-y rounded-2xl border bg-card">
          {faqs.map((faq) => (
            <details
              key={faq.question}
              className="group px-5 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                <h3>{faq.question}</h3>
                <ChevronDownIcon
                  aria-hidden
                  className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="pb-5 text-muted-foreground">{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}
