import type { Metadata } from "next";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import {
  CategoryLinks,
  describeFilters,
  ShopListing,
  ShopListingSkeleton,
} from "@/components/shop/shop-listing";
import {
  isIndexableListing,
  parseShopFilters,
  serializeShopFilters,
  type ShopFilters,
} from "@refnused/database/lib/shop/filters";
import { pageMetadata } from "@/lib/metadata";
import { orFallback } from "@/lib/shop/load";
import {
  cachedFacets,
  cachedSearch,
  cachedShopBrands,
  cachedShopCategories,
} from "@/lib/shop/queries";
import { listingNoun } from "@refnused/database/lib/shop/variant-label";

export async function generateMetadata({ searchParams }: PageProps<"/shop">): Promise<Metadata> {
  const filters = parseShopFilters(await searchParams);
  const query = serializeShopFilters(filters);
  const [brands, categories] = await Promise.all([
    orFallback("brands", cachedShopBrands, []),
    orFallback("categories", cachedShopCategories, []),
  ]);
  const noun = listingNoun(
    filters.categories,
    categories.map((c) => c.slug),
  );
  const brand =
    filters.brands.length === 1
      ? brands.find((b) => b.slug === filters.brands[0])?.name
      : undefined;
  const title = isIndexableListing(filters)
    ? `Refurbished ${noun.many} with warranty`
    : describeFilters(filters, { brand, noun: noun.many }) +
      (filters.page > 1 ? ` · page ${filters.page}` : "");
  return pageMetadata({
    title,
    description:
      categories.length > 1
        ? "Tested and graded refurbished tech with a warranty. Free UK delivery or click and collect in North and South Shields."
        : "Tested, graded and data-wiped refurbished iPhone, Samsung Galaxy and Google Pixel phones with a 12-month warranty. Free UK delivery or click and collect in North and South Shields.",
    path: query ? `/shop?${query}` : "/shop",
    // Filtered combinations are useful to share but not to index.
    noindex: !isIndexableListing(filters),
  });
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
      <Suspense fallback={<ShopListingSkeleton />}>
        <Listing searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Listing({ searchParams }: Pick<PageProps<"/shop">, "searchParams">) {
  const filters: ShopFilters = parseShopFilters(await searchParams);
  const [result, facets, categories] = await Promise.all([
    orFallback("search", () => cachedSearch(filters), null),
    orFallback("facets", () => cachedFacets(filters), null),
    orFallback("categories", cachedShopCategories, []),
  ]);
  const noun = listingNoun(
    filters.categories,
    categories.map((c) => c.slug),
  );
  return (
    <>
      <h1 className="mt-6 text-4xl font-semibold sm:text-5xl">Refurbished {noun.many}</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
        Every {noun.one} is tested and graded, with a warranty. The photos are of the actual{" "}
        {noun.one} you’ll get.
      </p>
      <CategoryLinks categories={categories} />
      <ShopListing filters={filters} result={result} facets={facets} noun={noun} />
    </>
  );
}
