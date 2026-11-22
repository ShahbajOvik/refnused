import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { HowItWorks } from "@/components/home/how-it-works";
import { QuickQuoteSearch } from "@/components/home/quick-quote-search";
import { MotionProvider } from "@/components/motion/motion-provider";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { modelSearchQuerySchema } from "@/lib/catalogue/home-data";
import { loadModelSearch } from "@/lib/catalogue/queries";
import { formatPrice } from "@/lib/format";
import { guidePath, WIPE_GUIDE_SLUG } from "@/lib/guides/slugs";
import { pageMetadata } from "@/lib/metadata";
import { cachedSellBrands } from "@/lib/sell/queries";

export const metadata = pageMetadata({
  title: "Sell your phone for cash",
  description:
    "Get an instant quote for your Apple, Samsung or Google phone. Free postage, or drop it off in North Shields or South Shields.",
  path: "/sell",
});

export default function SellPage({ searchParams }: PageProps<"/sell">) {
  return (
    <MotionProvider>
      <div className="page-container py-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Sell", href: "/sell" },
          ]}
        />
        <div className="mt-6 max-w-2xl">
          <h1 className="text-4xl font-semibold sm:text-5xl">Sell your phone</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Find your model and answer a few questions for an instant price.
          </p>
          <div className="mt-6">
            <QuickQuoteSearch />
          </div>
        </div>
        <Suspense fallback={null}>
          <SearchResults searchParams={searchParams} />
        </Suspense>
        <section aria-labelledby="brands-heading" className="mt-12">
          <h2 id="brands-heading" className="text-2xl font-semibold">
            Or choose a brand
          </h2>
          <BrandGrid />
        </section>
        <p className="mt-8 text-muted-foreground">
          Getting ready to sell?{" "}
          <Link
            href={guidePath(WIPE_GUIDE_SLUG)}
            className="font-medium text-primary underline underline-offset-4"
          >
            How to wipe your phone before you send it
          </Link>
          {" · "}
          <Link href="/guides" className="font-medium text-primary underline underline-offset-4">
            All guides
          </Link>
        </p>
      </div>
      <HowItWorks />
    </MotionProvider>
  );
}

async function BrandGrid() {
  const brands = await cachedSellBrands();
  return (
    <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
      {brands.map((brand) => (
        <li key={brand.slug}>
          <Link
            href={`/sell/${brand.slug}`}
            className="flex h-24 items-center justify-between rounded-2xl border bg-card px-6 text-xl font-semibold transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {brand.name}
            <ArrowRightIcon className="size-5 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Results for the no-JavaScript search form (GET /sell?q=…). */
async function SearchResults({ searchParams }: Pick<PageProps<"/sell">, "searchParams">) {
  const { q } = await searchParams;
  if (typeof q !== "string" || !q.trim()) return null;
  const parsed = modelSearchQuerySchema.safeParse(q);
  const results = parsed.success ? await loadModelSearch(parsed.data) : [];

  return (
    <section aria-labelledby="results-heading" className="mt-8 max-w-2xl">
      <h2 id="results-heading" className="text-xl font-semibold">
        Results for “{q}”
      </h2>
      {results === null ? (
        <p className="mt-3 text-muted-foreground">
          Search isn’t working right now. Please choose a brand below.
        </p>
      ) : results.length === 0 ? (
        <p className="mt-3 text-muted-foreground">
          We couldn’t find that phone. Try a shorter search, or choose a brand below.
        </p>
      ) : (
        <ul className="mt-3 divide-y rounded-2xl border bg-card">
          {results.map((r) => (
            <li key={r.slug}>
              <Link
                href={`/sell/${r.brandSlug}/${r.slug}`}
                className="flex min-h-14 items-center justify-between gap-4 px-4 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span>
                  <span className="text-muted-foreground">{r.brand}</span>{" "}
                  <span className="font-medium">{r.name}</span>
                </span>
                {r.maxPricePence ? (
                  <span className="text-sm">
                    Up to <strong>{formatPrice(r.maxPricePence, { whole: true })}</strong>
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
