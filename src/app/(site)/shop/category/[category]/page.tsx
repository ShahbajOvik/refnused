import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
  PARAM,
  parseShopFilters,
  serializeShopFilters,
} from "@/lib/shop/filters";
import { pageMetadata } from "@/lib/metadata";
import { orFallback } from "@/lib/shop/load";
import {
  cachedCategory,
  cachedCategoryParams,
  cachedFacets,
  cachedSearch,
  cachedShopCategories,
} from "@/lib/shop/queries";
import { itemNoun } from "@/lib/shop/variant-label";

export async function generateStaticParams() {
  return cachedCategoryParams();
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/shop/category/[category]">): Promise<Metadata> {
  const { category: slug } = await params;
  const category = await cachedCategory(slug);
  if (!category) return {};
  const filters = parseShopFilters(await searchParams);
  const query = serializeShopFilters(filters, { omit: [PARAM.categories] });
  const path = `/shop/category/${category.slug}`;
  const indexable = isIndexableListing({ ...filters, categories: [] });
  const name = category.name.toLowerCase();
  const title = indexable
    ? `Refurbished ${name} with warranty`
    : describeFilters(filters, { noun: name }) +
      (filters.page > 1 ? ` · page ${filters.page}` : "");
  const description =
    category.description ??
    `Refurbished ${name}, tested and graded with a warranty. Free UK delivery or click and collect in North and South Shields.`;
  return pageMetadata({
    title,
    description,
    path: query ? `${path}?${query}` : path,
    noindex: !indexable,
  });
}

export default function ShopCategoryPage({
  params,
  searchParams,
}: PageProps<"/shop/category/[category]">) {
  return (
    <div className="page-container py-8">
      <Suspense fallback={<ShopListingSkeleton />}>
        <CategoryListing params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CategoryListing({ params, searchParams }: PageProps<"/shop/category/[category]">) {
  const { category: slug } = await params;
  const category = await cachedCategory(slug);
  if (!category) notFound();

  const filters = { ...parseShopFilters(await searchParams), categories: [category.slug] };
  const [result, facets, categories] = await Promise.all([
    orFallback("search", () => cachedSearch(filters), null),
    orFallback("facets", () => cachedFacets(filters), null),
    orFallback("categories", cachedShopCategories, []),
  ]);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Shop", href: "/shop" },
          { label: category.name, href: `/shop/category/${category.slug}` },
        ]}
      />
      <h1 className="mt-6 text-4xl font-semibold sm:text-5xl">
        Refurbished {category.name.toLowerCase()}
      </h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
        {category.description ?? "Tested and graded, with a warranty."}
      </p>
      <CategoryLinks categories={categories} current={category.slug} />
      <ShopListing
        filters={filters}
        result={result}
        facets={facets}
        category={category}
        noun={itemNoun(category.slug)}
      />
    </>
  );
}
