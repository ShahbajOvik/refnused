import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { absoluteUrl, organizationJsonLd, storesJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <section className="page-container py-(--spacing-section)">
        <div className="max-w-prose-page">
          <h1 className="text-4xl font-semibold sm:text-5xl">
            Sell your phone in minutes. Buy refurbished with confidence.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">{siteConfig.description}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/sell">Get an instant quote</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/shop">Shop refurbished phones</Link>
            </Button>
          </div>
        </div>
      </section>
      <JsonLd
        data={[
          organizationJsonLd(),
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: siteConfig.name,
            url: absoluteUrl("/"),
            inLanguage: "en-GB",
          },
          ...storesJsonLd(),
        ]}
      />
    </>
  );
}
