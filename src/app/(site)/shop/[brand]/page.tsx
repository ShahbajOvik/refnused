import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { describeFilters, ShopListing, ShopListingSkeleton } from "@/components/shop/shop-listing";
import {
  isIndexableListing,
  PARAM,
  parseShopFilters,
  serializeShopFilters,
} from "@/lib/shop/filters";
import { orFallback } from "@/lib/shop/load";
import { cachedBrand, cachedFacets, cachedSearch, cachedShopBrands } from "@/lib/shop/queries";

export async function generateStaticParams() {
  const brands = await cachedShopBrands();
  return brands.map((b) => ({ brand: b.slug }));
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/shop/[brand]">): Promise<Metadata> {
  const { brand: slug } = await params;
  const brand = await cachedBrand(slug);
  if (!brand) return {};
  const filters = parseShopFilters(await searchParams);
  const query = serializeShopFilters(filters, { omit: [PARAM.brands] });
  const indexable = isIndexableListing({ ...filters, brands: [] });
  return {
    title: indexable
      ? `Refurbished ${brand.name} phones`
      : describeFilters(filters, { brand: brand.name }) +
        (filters.page > 1 ? ` · page ${filters.page}` : ""),
    description: `Refurbished ${brand.name} phones, tested and graded with a 12-month warranty. Free UK delivery or click and collect in North and South Shields.`,
    alternates: { canonical: query ? `/shop/${brand.slug}?${query}` : `/shop/${brand.slug}` },
    robots: indexable ? undefined : { index: false, follow: true },
  };
}

export default function ShopBrandPage({ params, searchParams }: PageProps<"/shop/[brand]">) {
  return (
    <div className="page-container py-8">
      <Suspense fallback={<ShopListingSkeleton />}>
        <BrandListing params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function BrandListing({ params, searchParams }: PageProps<"/shop/[brand]">) {
  const { brand: slug } = await params;
  const brand = await cachedBrand(slug);
  if (!brand) notFound();
  const filters = { ...parseShopFilters(await searchParams), brands: [brand.slug] };
  const [result, facets] = await Promise.all([
    orFallback("search", () => cachedSearch(filters), null),
    orFallback("facets", () => cachedFacets(filters), null),
  ]);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Shop", href: "/shop" },
          { label: brand.name, href: `/shop/${brand.slug}` },
        ]}
      />
      <h1 className="mt-6 text-4xl font-semibold sm:text-5xl">Refurbished {brand.name} phones</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
        Tested, graded and data-wiped, with a 12-month warranty.
      </p>
      <ShopListing filters={filters} result={result} facets={facets} brand={brand} />
    </>
  );
}
