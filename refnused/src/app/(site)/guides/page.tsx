import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { Skeleton } from "@/components/ui/skeleton";
import { siteConfig } from "@refnused/database/config/site";
import { formatPrice } from "@refnused/database/lib/format";
import { cachedGuideSummaries, cachedSellableModels } from "@/lib/guides/queries";
import { guidePath, modelValueSlug } from "@refnused/database/lib/guides/slugs";
import { guidesIndexMetadata } from "@/lib/metadata-templates";
import { absoluteUrl, WEBSITE_ID } from "@refnused/database/lib/seo";
import { orFallback } from "@/lib/shop/load";

export const metadata = guidesIndexMetadata();

export default function GuidesPage() {
  return (
    <div className="page-container py-8">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Guides", href: "/guides" },
        ]}
      />
      <h1 className="mt-6 text-4xl font-semibold sm:text-5xl">Guides</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
        What your phone is worth today, how to get it ready to sell, and what our refurbished grades
        mean.
      </p>
      <Suspense fallback={<Skeleton className="mt-10 h-96 w-full rounded-2xl" />}>
        <GuideLists />
      </Suspense>
    </div>
  );
}

const cardClass =
  "flex h-full items-start justify-between gap-4 rounded-2xl border bg-card p-5 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

async function GuideLists() {
  const [guides, models] = await Promise.all([
    orFallback("guides", cachedGuideSummaries, []),
    orFallback("guide models", cachedSellableModels, []),
  ]);
  const editorial = guides.filter((g) => g.template !== "model-value");
  const priceGuides = new Set(
    guides.filter((g) => g.template === "model-value").map((g) => g.slug),
  );
  const brands = new Map<string, { name: string; models: typeof models }>();
  for (const m of models) {
    if (!priceGuides.has(modelValueSlug(m.slug))) continue;
    const brand = brands.get(m.brandSlug) ?? { name: m.brandName, models: [] };
    brand.models.push(m);
    brands.set(m.brandSlug, brand);
  }

  return (
    <>
      <section aria-labelledby="editorial-heading" className="mt-10">
        <h2 id="editorial-heading" className="text-2xl font-semibold">
          Selling and buying
        </h2>
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {editorial.map((g) => (
            <li key={g.slug}>
              <Link href={guidePath(g.slug)} className={cardClass}>
                <span>
                  <span className="block text-lg font-semibold">{g.title}</span>
                  <span className="mt-1 block text-muted-foreground">{g.description}</span>
                </span>
                <ChevronRightIcon
                  className="mt-1 size-5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {brands.size ? (
        <section aria-labelledby="prices-heading" className="mt-12">
          <h2 id="prices-heading" className="text-2xl font-semibold">
            How much is my phone worth?
          </h2>
          <p className="mt-2 text-muted-foreground">
            Today’s trade-in prices for every model we buy, by storage and condition.
          </p>
          {[...brands].map(([brandSlug, brand]) => (
            <div key={brandSlug} className="mt-6">
              <h3 className="text-lg font-semibold">{brand.name}</h3>
              <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {brand.models.map((m) => (
                  <li key={m.slug}>
                    <Link
                      href={guidePath(modelValueSlug(m.slug))}
                      className="flex min-h-11 items-center justify-between gap-3 rounded-lg border px-4 py-2 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="font-medium">
                        {brand.name} {m.name}
                      </span>
                      {m.maxPricePence ? (
                        <span className="text-sm whitespace-nowrap text-muted-foreground">
                          Up to {formatPrice(m.maxPricePence, { whole: true })}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: `${siteConfig.name} guides`,
          url: absoluteUrl("/guides"),
          inLanguage: siteConfig.locale,
          isPartOf: { "@id": absoluteUrl(WEBSITE_ID) },
          mainEntity: {
            "@type": "ItemList",
            itemListElement: guides.map((g, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: g.title,
              url: absoluteUrl(guidePath(g.slug)),
            })),
          },
        }}
      />
    </>
  );
}
