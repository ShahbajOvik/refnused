import { FaqList } from "@/components/seo/faq-list";
import { faqs } from "@/content/home";
import { faqPageJsonLd } from "@/lib/seo";

import { SectionHeading } from "./section-heading";

export function Faq() {
  return (
    <section aria-labelledby="faq-heading" className="py-(--spacing-section)">
      <div className="page-container grid gap-10 lg:grid-cols-[1fr_2fr]">
        <SectionHeading id="faq-heading" eyebrow="Help" title="Questions, answered" />
        <FaqList items={[...faqs]} />
      </div>
    </section>
  );
}

export function faqJsonLd() {
  return faqPageJsonLd([...faqs]);
}
