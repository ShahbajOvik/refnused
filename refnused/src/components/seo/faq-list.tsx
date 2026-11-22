import { ChevronDownIcon } from "lucide-react";

import type { FaqItem } from "@refnused/database/lib/seo";
import { cn } from "@/lib/utils";

/**
 * Native <details> accordion: accessible and needs no JavaScript. Pair it
 * with faqPageJsonLd(items) built from the same items, so the structured
 * data always matches what's on the page.
 */
export function FaqList({
  items,
  headingLevel = 3,
  className,
}: {
  items: FaqItem[];
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={cn("divide-y rounded-2xl border bg-card", className)}>
      {items.map((faq) => (
        <details
          key={faq.question}
          className="group px-5 [&_summary::-webkit-details-marker]:hidden"
        >
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            <Heading>{faq.question}</Heading>
            <ChevronDownIcon
              aria-hidden
              className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            />
          </summary>
          <p className="pb-5 text-muted-foreground">{faq.answer}</p>
        </details>
      ))}
    </div>
  );
}
