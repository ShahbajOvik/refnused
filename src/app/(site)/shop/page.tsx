import type { Metadata } from "next";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { describeFilters, ShopListing, ShopListingSkeleton } from "@/components/shop/shop-listing";
import {
  isIndexableListing,
  parseShopFilters,
  serializeShopFilters,
  type ShopFilters,
} from "@/lib/shop/filters";
import { orFallback } from "@/lib/shop/load";
import { cachedFacets, cachedSearch, cachedShopBrands } from "@/lib/shop/queries";

export async function generateMetadata({ searchParams }: PageProps<"/shop">): Promise<Metadata> {
  const filters = parseShopFilters(await searchParams);
  const query = serializeShopFilters(filters);
  const brands = await orFallback("brands", cachedShopBrands, []);
  const brand =
    filters.brands.length === 1
      ? brands.find((b) => b.slug === filters.brands[0])?.name
      : undefined;
  const title = isIndexableListing(filters)
    ? "Refurbished phones with warranty"
    : describeFilters(filters, { brand }) + (filters.page > 1 ? ` · page ${filters.page}` : "");
  return {
    title,
    description:
      "Tested, graded and data-wiped refurbished iPhone, Samsung Galaxy and Google Pixel phones with a 12-month warranty. Free UK delivery or click and collect in North and South Shields.",
    alternates: { canonical: query ? `/shop?${query}` : "/shop" },
    // Filtered combinations are useful to share but not to index.
    robots: isIndexableListing(filters) ? undefined : { index: false, follow: true },
  };
}

export default function ShopPage({ searchParams }: PageProps<"/shop">) {
  return (
    <div className="page-container py-8">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Shop", href: "/shop" },
        ]}
      />
      <h1 className="mt-6 text-4xl font-semibold sm:text-5xl">Refurbished phones</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
        Every phone is tested, graded and data-wiped, with a 12-month warranty. The photos are of
        the actual phone you’ll get.
      </p>
      <Suspense fallback={<ShopListingSkeleton />}>
        <Listing searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Listing({ searchParams }: Pick<PageProps<"/shop">, "searchParams">) {
  const filters: ShopFilters = parseShopFilters(await searchParams);
  const [result, facets] = await Promise.all([
    orFallback("search", () => cachedSearch(filters), null),
    orFallback("facets", () => cachedFacets(filters), null),
  ]);
  return <ShopListing filters={filters} result={result} facets={facets} />;
}
