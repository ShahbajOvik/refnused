import { ChevronLeftIcon, ChevronRightIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import Link from "next/link";

import { JsonLd } from "@/components/seo/json-ld";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@refnused/database/lib/format";
import { GRADE_INFO, type Grade } from "@refnused/database/lib/grades";
import { absoluteUrl } from "@refnused/database/lib/seo";
import type { FacetOption, ShopFacets, ShopSearchResult } from "@/lib/shop/catalogue";
import {
  hasActiveFilters,
  PARAM,
  SHOP_SORTS,
  SORT_LABELS,
  serializeShopFilters,
  withFilters,
  withoutValue,
  type ListFacet,
  type ShopFilters,
} from "@refnused/database/lib/shop/filters";
import { productPath, productTitle } from "@refnused/database/lib/shop/paths";
import { cn } from "@/lib/utils";

import { FilterForm } from "./filter-form";
import { ProductCard } from "./product-card";

type Noun = { one: string; many: string };

/** A listing whose brand or category comes from the path, not a filter. */
type ListingScope = { kind: "brand" | "category"; path: string; param: string; name: string };

type ListingProps = {
  filters: ShopFilters;
  result: ShopSearchResult | null;
  facets: ShopFacets | null;
  /** Set on /shop/[brand]. */
  brand?: { slug: string; name: string };
  /** Set on /shop/category/[category]. */
  category?: { slug: string; name: string };
  /** What the listing calls its items. */
  noun?: Noun;
};

type ScopedProps = Pick<ListingProps, "filters" | "facets"> & { scope?: ListingScope; noun: Noun };

/** Path of a listing with these filters (the path's own filter left out). */
function hrefFor(filters: ShopFilters, scope?: ListingScope) {
  const base = scope?.path ?? "/shop";
  const query = serializeShopFilters(filters, { omit: scope ? [scope.param] : [] });
  return query ? `${base}?${query}` : base;
}

export function ShopListing({
  filters,
  result,
  facets,
  brand,
  category,
  noun = { one: "phone", many: "phones" },
}: ListingProps) {
  const scope: ListingScope | undefined = brand
    ? { kind: "brand", path: `/shop/${brand.slug}`, param: PARAM.brands, name: brand.name }
    : category
      ? {
          kind: "category",
          path: `/shop/category/${category.slug}`,
          param: PARAM.categories,
          name: category.name,
        }
      : undefined;
  const action = scope?.path ?? "/shop";
  const activeCount =
    filters.models.length +
    filters.grades.length +
    filters.storage.length +
    filters.colours.length +
    filters.stores.length +
    (scope?.kind === "brand" ? 0 : filters.brands.length) +
    (scope?.kind === "category" ? 0 : filters.categories.length) +
    (filters.minPrice !== undefined || filters.maxPrice !== undefined ? 1 : 0) +
    (filters.minBattery !== undefined ? 1 : 0);

  return (
    <FilterForm
      action={action}
      stateKey={serializeShopFilters(filters)}
      omit={scope ? [scope.param] : undefined}
      className="group/filters mt-6 grid gap-8 lg:grid-cols-[16rem_1fr]"
    >
      <FilterPanel filters={filters} facets={facets} scope={scope} noun={noun} />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a
            href="#filters"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:hidden"
          >
            <SlidersHorizontalIcon className="size-4" aria-hidden />
            Filters{activeCount ? ` (${activeCount})` : ""}
          </a>
          <p role="status" className="text-sm text-muted-foreground">
            {result ? (
              <>
                <strong className="text-foreground">{result.total}</strong>{" "}
                {result.total === 1 ? noun.one : noun.many}
              </>
            ) : null}
          </p>
          <div className="flex items-center gap-2">
            <label htmlFor="shop-sort" className="text-sm">
              Sort by
            </label>
            <select
              id="shop-sort"
              name={PARAM.sort}
              defaultValue={filters.sort}
              className="h-11 rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {SHOP_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {SORT_LABELS[sort]}
                </option>
              ))}
            </select>
            <noscript>
              <button type="submit" className="h-11 rounded-lg border px-3 text-sm">
                Sort
              </button>
            </noscript>
          </div>
        </div>

        <ActiveFilters filters={filters} facets={facets} scope={scope} />

        <div className="mt-6 transition-opacity group-data-pending/filters:opacity-60 motion-reduce:transition-none">
          <Results filters={filters} result={result} scope={scope} noun={noun} />
        </div>
      </div>
    </FilterForm>
  );
}

// Filter panel -----------------------------------------------------------------

function FilterPanel({ filters, facets, scope, noun }: ScopedProps) {
  return (
    <div
      id="filters"
      tabIndex={-1}
      data-filter-panel
      aria-labelledby="filters-heading"
      role="region"
      className={cn(
        "hidden focus:outline-none lg:block",
        // Open on small screens: #filters without JS, data-panel-open with it.
        "target:block max-lg:target:fixed max-lg:target:inset-0 max-lg:target:z-50 max-lg:target:overflow-y-auto max-lg:target:bg-background max-lg:target:p-4",
        "group-data-panel-open/filters:block max-lg:group-data-panel-open/filters:fixed max-lg:group-data-panel-open/filters:inset-0 max-lg:group-data-panel-open/filters:z-50 max-lg:group-data-panel-open/filters:overflow-y-auto max-lg:group-data-panel-open/filters:bg-background max-lg:group-data-panel-open/filters:p-4",
      )}
    >
      <div className="flex items-center justify-between">
        <h2 id="filters-heading" className="text-lg font-semibold">
          Filters
        </h2>
        <a
          href="#"
          data-close-filters
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:hidden"
        >
          <XIcon className="size-4" aria-hidden /> Close
        </a>
      </div>

      {facets ? (
        <div className="mt-4 flex flex-col gap-6">
          {!scope && facets.categories.length > 1 ? (
            <CheckboxFacet
              legend="Category"
              param={PARAM.categories}
              options={facets.categories}
              selected={filters.categories}
              noun={noun}
            />
          ) : null}
          {scope?.kind === "brand" ? (
            <p className="text-sm">
              Showing {scope.name} only.{" "}
              <Link href="/shop" className="font-medium text-primary underline underline-offset-4">
                All brands
              </Link>
            </p>
          ) : (
            <CheckboxFacet
              legend="Brand"
              param={PARAM.brands}
              options={facets.brands}
              selected={filters.brands}
              noun={noun}
            />
          )}
          <CheckboxFacet
            legend="Model"
            param={PARAM.models}
            options={facets.models}
            selected={filters.models}
            noun={noun}
            scroll
          />
          <PriceFacet filters={filters} range={facets.price} />
          <CheckboxFacet
            legend="Condition"
            param={PARAM.grades}
            options={facets.grades.map((g) => ({
              ...g,
              label: `Grade ${g.value} · ${GRADE_INFO[g.value as Grade].label}`,
              hint: GRADE_INFO[g.value as Grade].description,
            }))}
            selected={filters.grades}
            noun={noun}
          />
          <CheckboxFacet
            legend="Storage"
            param={PARAM.storage}
            options={facets.storage}
            selected={filters.storage.map(String)}
            noun={noun}
          />
          <CheckboxFacet
            legend="Colour"
            param={PARAM.colours}
            options={facets.colours}
            selected={filters.colours}
            noun={noun}
            scroll
          />
          {filters.minBattery !== undefined || facets.battery.some((o) => o.count > 0) ? (
            <BatteryFacet filters={filters} options={facets.battery} noun={noun} />
          ) : null}
          <CheckboxFacet
            legend="Available at"
            param={PARAM.stores}
            options={facets.stores}
            selected={filters.stores}
            noun={noun}
          />
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Filters aren’t available right now.</p>
      )}

      <div className="sticky bottom-0 mt-6 flex gap-2 bg-background py-3 lg:static lg:bg-transparent">
        <button
          type="submit"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Show {noun.many}
        </button>
        {hasActiveFilters(filters) ? (
          <Link
            href={scope?.path ?? "/shop"}
            className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Clear all
          </Link>
        ) : null}
      </div>
    </div>
  );
}

const fieldsetClass = "flex flex-col gap-1 border-t pt-4 first:border-t-0 first:pt-0";
const legendClass = "mb-2 text-sm font-semibold";

function CheckboxFacet({
  legend,
  param,
  options,
  selected,
  noun,
  scroll = false,
}: {
  legend: string;
  noun: Noun;
  param: string;
  options: (FacetOption & { hint?: string })[];
  selected: string[];
  scroll?: boolean;
}) {
  // Keep selected values visible even when nothing matches them any more.
  const known = new Set(options.map((o) => o.value));
  const all: (FacetOption & { hint?: string })[] = [
    ...options,
    ...selected.filter((v) => !known.has(v)).map((v) => ({ value: v, label: v, count: 0 })),
  ];
  if (all.length === 0) return null;

  let lastGroup: string | undefined;
  return (
    <fieldset className={fieldsetClass}>
      <legend className={legendClass}>{legend}</legend>
      <div className={cn("flex flex-col gap-0.5", scroll && "max-h-64 overflow-y-auto pr-1")}>
        {all.map((option) => {
          const checked = selected.includes(option.value);
          const id = `f-${param}-${option.value}`;
          const groupLabel = option.group && option.group !== lastGroup ? option.group : null;
          lastGroup = option.group;
          return (
            <div key={option.value}>
              {groupLabel ? (
                <p className="mt-2 mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {groupLabel}
                </p>
              ) : null}
              <label
                htmlFor={id}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1 text-sm hover:bg-accent/60",
                  option.count === 0 && !checked && "cursor-not-allowed text-muted-foreground",
                )}
              >
                <input
                  id={id}
                  type="checkbox"
                  name={param}
                  value={option.value}
                  defaultChecked={checked}
                  disabled={option.count === 0 && !checked}
                  className="size-5 shrink-0 accent-(--primary)"
                />
                {"hex" in option && option.hex ? (
                  <span
                    aria-hidden
                    className="size-4 shrink-0 rounded-full border border-foreground/20"
                    style={{ backgroundColor: option.hex }}
                  />
                ) : null}
                <span className="flex flex-1 flex-col">
                  <span>{option.label}</span>
                  {"hint" in option && option.hint ? (
                    <span className="text-xs text-muted-foreground">{option.hint}</span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {option.count}
                  <span className="sr-only"> {option.count === 1 ? noun.one : noun.many}</span>
                </span>
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

function PriceFacet({ filters, range }: { filters: ShopFilters; range: ShopFacets["price"] }) {
  const low = range ? Math.floor(range.minPence / 100) : undefined;
  const high = range ? Math.ceil(range.maxPence / 100) : undefined;
  return (
    <fieldset className={fieldsetClass}>
      <legend className={legendClass}>Price</legend>
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ["min", "Minimum", filters.minPrice, low],
            ["max", "Maximum", filters.maxPrice, high],
          ] as const
        ).map(([param, label, value, placeholder]) => (
          <div key={param} className="flex flex-col gap-1">
            <label htmlFor={`f-price-${param}`} className="text-xs text-muted-foreground">
              {label} (£)
            </label>
            <input
              id={`f-price-${param}`}
              type="number"
              name={param}
              inputMode="numeric"
              min={0}
              step={1}
              defaultValue={value}
              placeholder={placeholder !== undefined ? String(placeholder) : undefined}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function BatteryFacet({
  filters,
  options,
  noun,
}: {
  filters: ShopFilters;
  options: FacetOption[];
  noun: Noun;
}) {
  const current = filters.minBattery === undefined ? "" : String(filters.minBattery);
  return (
    <fieldset className={fieldsetClass}>
      <legend className={legendClass}>Battery health</legend>
      {[{ value: "", label: "Any", count: undefined }, ...options].map((option) => {
        const id = `f-battery-${option.value || "any"}`;
        return (
          <label
            key={id}
            htmlFor={id}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1 text-sm hover:bg-accent/60"
          >
            <input
              id={id}
              type="radio"
              name={PARAM.minBattery}
              value={option.value}
              defaultChecked={current === option.value}
              className="size-5 shrink-0 accent-(--primary)"
            />
            <span className="flex-1">{option.label}</span>
            {option.count !== undefined ? (
              <span className="text-xs text-muted-foreground tabular-nums">
                {option.count}
                <span className="sr-only"> {option.count === 1 ? noun.one : noun.many}</span>
              </span>
            ) : null}
          </label>
        );
      })}
    </fieldset>
  );
}

// Active filters ---------------------------------------------------------------

function ActiveFilters({ filters, facets, scope }: Omit<ScopedProps, "noun">) {
  const labelFor = (facet: keyof ShopFacets, value: string) => {
    const list = facets?.[facet];
    return (Array.isArray(list) && list.find((o) => o.value === value)?.label) || value;
  };
  const chips: { label: string; href: string }[] = [];
  const addList = <F extends ListFacet>(facet: F, describe: (v: string) => string) => {
    for (const value of filters[facet]) {
      chips.push({
        label: describe(String(value)),
        href: hrefFor(withoutValue(filters, facet, value), scope),
      });
    }
  };
  if (scope?.kind !== "category") addList("categories", (v) => labelFor("categories", v));
  if (scope?.kind !== "brand") addList("brands", (v) => labelFor("brands", v));
  addList("models", (v) => labelFor("models", v));
  addList("grades", (v) => `Grade ${v}`);
  addList("storage", (v) => labelFor("storage", v));
  addList("colours", (v) => labelFor("colours", v));
  addList("stores", (v) => labelFor("stores", v));
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    const from = filters.minPrice !== undefined ? `£${filters.minPrice}` : "£0";
    const to = filters.maxPrice !== undefined ? `£${filters.maxPrice}` : "any";
    chips.push({
      label: `Price ${from} to ${to}`,
      href: hrefFor(withFilters(filters, { minPrice: undefined, maxPrice: undefined }), scope),
    });
  }
  if (filters.minBattery !== undefined) {
    chips.push({
      label: `Battery ${filters.minBattery}%+`,
      href: hrefFor(withFilters(filters, { minBattery: undefined }), scope),
    });
  }
  if (chips.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <h2 className="sr-only">Active filters</h2>
      <ul className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <li key={chip.href + chip.label}>
            <Link
              href={chip.href}
              scroll={false}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border bg-muted/50 px-3 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {chip.label}
              <XIcon className="size-3.5" aria-hidden />
              <span className="sr-only">(remove filter)</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={scope?.path ?? "/shop"}
        scroll={false}
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Clear all
      </Link>
    </div>
  );
}

// Results ----------------------------------------------------------------------

const gridClass = "grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 lg:gap-6";

function Results({
  filters,
  result,
  scope,
  noun,
}: Pick<ListingProps, "filters" | "result"> & { scope?: ListingScope; noun: Noun }) {
  if (!result) {
    return (
      <p className="rounded-2xl border bg-muted/40 p-8 text-center text-muted-foreground">
        We can’t show our {noun.many} right now. Please try again in a moment.
      </p>
    );
  }
  if (result.items.length === 0) {
    const pastEnd = result.total > 0;
    return (
      <div className="rounded-2xl border bg-muted/40 p-8 text-center">
        <p className="font-medium">
          {pastEnd
            ? `There are no ${noun.many} on this page.`
            : `No ${noun.many} match those filters.`}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          <Link
            href={pastEnd ? hrefFor({ ...filters, page: 1 }, scope) : (scope?.path ?? "/shop")}
            className="font-medium text-primary underline underline-offset-4"
          >
            {pastEnd ? "Go to the first page" : "Clear the filters"}
          </Link>{" "}
          or{" "}
          <Link href="/stores" className="font-medium text-primary underline underline-offset-4">
            ask in store
          </Link>
          . New stock arrives every day.
        </p>
      </div>
    );
  }

  const offset = (result.page - 1) * result.pageSize;
  return (
    <>
      <h2 className="sr-only capitalize">{noun.many}</h2>
      <ul className={gridClass}>
        {result.items.map((product, index) => (
          <li key={product.id}>
            <ProductCard product={product} compare priority={result.page === 1 && index < 2} />
          </li>
        ))}
      </ul>
      <Pagination filters={filters} result={result} scope={scope} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          numberOfItems: result.total,
          itemListElement: result.items.map((p, index) => ({
            "@type": "ListItem",
            position: offset + index + 1,
            url: absoluteUrl(productPath(p)),
            name: productTitle(p),
          })),
        }}
      />
    </>
  );
}

/** 1 … 4 5 [6] 7 8 … 20 */
export function pageWindow(page: number, pageCount: number, radius = 1): (number | "gap")[] {
  const pages = new Set([1, pageCount]);
  for (let p = page - radius; p <= page + radius; p++) {
    if (p >= 1 && p <= pageCount) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

function Pagination({
  filters,
  result,
  scope,
}: Pick<ListingProps, "filters"> & { result: ShopSearchResult; scope?: ListingScope }) {
  if (result.pageCount <= 1) return null;
  const link = (page: number) => hrefFor({ ...filters, page }, scope);
  const linkClass =
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

  return (
    <nav aria-label="Pages" className="mt-10 flex flex-wrap items-center justify-center gap-2">
      {result.page > 1 ? (
        <Link href={link(result.page - 1)} rel="prev" className={linkClass}>
          <ChevronLeftIcon className="size-4" aria-hidden />
          Previous
        </Link>
      ) : null}
      <ul className="flex flex-wrap items-center gap-2">
        {pageWindow(result.page, result.pageCount).map((p, i) =>
          p === "gap" ? (
            <li key={`gap-${i}`} aria-hidden className="px-1 text-muted-foreground">
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                href={link(p)}
                aria-current={p === result.page ? "page" : undefined}
                className={cn(
                  linkClass,
                  p === result.page &&
                    "border-primary bg-primary text-primary-foreground hover:bg-primary",
                )}
              >
                <span className="sr-only">Page </span>
                {p}
              </Link>
            </li>
          ),
        )}
      </ul>
      {result.page < result.pageCount ? (
        <Link href={link(result.page + 1)} rel="next" className={linkClass}>
          Next
          <ChevronRightIcon className="size-4" aria-hidden />
        </Link>
      ) : null}
    </nav>
  );
}

/** Links to each category, shown once the shop sells more than one. */
export function CategoryLinks({
  categories,
  current,
}: {
  categories: { slug: string; name: string }[];
  current?: string;
}) {
  if (categories.length < 2) return null;
  const links = [
    { key: "all", label: "All", href: "/shop" },
    ...categories.map((c) => ({
      key: c.slug,
      label: c.name,
      href: `/shop/category/${c.slug}`,
    })),
  ];
  return (
    <nav aria-label="Categories" className="mt-6 overflow-x-auto pb-1">
      <ul className="flex gap-2">
        {links.map((link) => (
          <li key={link.key} className="shrink-0">
            <Link
              href={link.href}
              aria-current={(current ?? "all") === link.key ? "page" : undefined}
              className="inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function ShopListingSkeleton() {
  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[16rem_1fr]" aria-hidden>
      <Skeleton className="hidden h-[40rem] lg:block" />
      <div>
        <Skeleton className="h-11 w-full" />
        <div className={cn(gridClass, "mt-6")}>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/6.4] rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** "Refurbished Apple phones · Grade A · under £400" for titles. */
export function describeFilters(
  filters: ShopFilters,
  names: { brand?: string; models?: string[]; noun?: string },
): string {
  const noun = names.noun ?? "phones";
  const parts: string[] = [];
  if (names.models?.length === 1) parts.push(`Refurbished ${names.models[0]}`);
  else if (names.brand) parts.push(`Refurbished ${names.brand} ${noun}`);
  else parts.push(`Refurbished ${noun}`);
  if (filters.grades.length === 1) parts.push(`Grade ${filters.grades[0]}`);
  if (filters.storage.length === 1) parts.push(`${filters.storage[0]}GB`);
  if (filters.maxPrice !== undefined)
    parts.push(`under ${formatPrice(filters.maxPrice * 100, { whole: true })}`);
  return parts.join(" · ");
}
