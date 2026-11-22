import { PlusIcon, XIcon } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { SyncCompareSelection } from "@/components/shop/compare-tray";
import { GradeBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@refnused/database/lib/format";
import { GRADE_INFO } from "@refnused/database/lib/grades";
import type { ShopProduct } from "@/lib/shop/catalogue";
import { parseCompareItems, MAX_COMPARE_ITEMS } from "@/lib/shop/compare";
import { orFallback } from "@/lib/shop/load";
import { productImageSrc, productPath } from "@refnused/database/lib/shop/paths";
import { batteryRating } from "@/lib/shop/product-info";
import { cachedCompare } from "@/lib/shop/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Compare phones",
  description: `Compare up to ${MAX_COMPARE_ITEMS} refurbished phones side by side: price, condition, battery health, storage and warranty.`,
  alternates: { canonical: "/compare" },
  // Every combination is a different URL; only the shop pages are indexed.
  robots: { index: false, follow: true },
};

export default function ComparePage({ searchParams }: PageProps<"/compare">) {
  return (
    <div className="page-container py-8">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Shop", href: "/shop" },
          { label: "Compare", href: "/compare" },
        ]}
      />
      <h1 className="mt-6 text-4xl font-semibold">Compare phones</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        Up to {MAX_COMPARE_ITEMS} phones side by side. Share this page’s link to show someone else.
      </p>
      <Suspense fallback={<Skeleton className="mt-8 h-[36rem] w-full rounded-2xl" />}>
        <Comparison searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const GRADE_RANK = { A: 0, B: 1, C: 2 } as const;

type Row = {
  label: string;
  value: (p: ShopProduct) => React.ReactNode;
  /** Returns the "best" value's products, for a text marker (not colour alone). */
  best?: (items: ShopProduct[]) => Set<string>;
};

function bestBy(items: ShopProduct[], score: (p: ShopProduct) => number) {
  const forSale = items.filter((p) => p.status === "listed");
  if (forSale.length < 2) return new Set<string>();
  const top = Math.max(...forSale.map(score));
  const winners = forSale.filter((p) => score(p) === top);
  // No marker when they're all the same.
  return winners.length === forSale.length ? new Set<string>() : new Set(winners.map((p) => p.id));
}

const ROWS: Row[] = [
  {
    label: "Price",
    value: (p) => <span className="text-lg font-semibold">{formatPrice(p.pricePence)}</span>,
    best: (items) => bestBy(items, (p) => -p.pricePence),
  },
  {
    label: "Condition",
    value: (p) => (
      <span className="flex flex-col items-start gap-1">
        <GradeBadge grade={p.grade} />
        <span className="text-sm text-muted-foreground">{GRADE_INFO[p.grade].description}</span>
      </span>
    ),
    best: (items) => bestBy(items, (p) => -GRADE_RANK[p.grade]),
  },
  {
    label: "Battery health",
    value: (p) =>
      p.batteryHealthPercent === null
        ? "Not applicable"
        : `${p.batteryHealthPercent}% (${batteryRating(p.batteryHealthPercent).label})`,
    best: (items) => bestBy(items, (p) => p.batteryHealthPercent ?? -1),
  },
  {
    label: "Storage",
    value: (p) => (p.storageGb ? `${p.storageGb}GB` : "Not applicable"),
    best: (items) => bestBy(items, (p) => p.storageGb ?? -1),
  },
  { label: "Specification", value: (p) => p.configuration || "Not listed" },
  { label: "Colour", value: (p) => p.colour },
  {
    label: "Warranty",
    value: (p) => `${p.warrantyMonths} months`,
    best: (items) => bestBy(items, (p) => p.warrantyMonths),
  },
  {
    label: "Released",
    value: (p) => String(p.releaseYear),
    best: (items) => bestBy(items, (p) => p.releaseYear),
  },
  { label: "Where it is", value: (p) => `${p.storeName}, ${p.storeTown}` },
  {
    label: "Availability",
    value: (p) => (p.status === "listed" ? "In stock" : p.status === "sold" ? "Sold" : "Reserved"),
  },
];

/** /compare?items=… without one of them. */
function withoutItem(items: ShopProduct[], slug: string) {
  const rest = items.filter((p) => p.slug !== slug).map((p) => p.slug);
  return rest.length ? `/compare?items=${rest.join(",")}` : "/compare";
}

async function Comparison({ searchParams }: Pick<PageProps<"/compare">, "searchParams">) {
  const slugs = parseCompareItems((await searchParams).items);
  const items = slugs.length ? await orFallback("compare", () => cachedCompare(slugs), null) : [];

  if (items === null) {
    return (
      <p className="mt-8 rounded-2xl border bg-muted/40 p-8 text-center text-muted-foreground">
        We can’t load the comparison right now. Please try again in a moment.
      </p>
    );
  }

  const sync = (
    <SyncCompareSelection slugs={items.filter((p) => p.status === "listed").map((p) => p.slug)} />
  );

  if (items.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border bg-muted/40 p-8 text-center">
        {sync}
        <p className="font-medium">No phones picked yet.</p>
        <p className="mt-2 text-muted-foreground">
          Press <strong>Compare</strong> on up to {MAX_COMPARE_ITEMS} phones in the shop, then come
          back here.
        </p>
        <Link
          href="/shop"
          className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Browse phones
        </Link>
      </div>
    );
  }

  const bests = new Map(ROWS.map((row) => [row.label, row.best?.(items) ?? new Set<string>()]));
  const canAdd = items.length < MAX_COMPARE_ITEMS;

  return (
    <div
      className="mt-8 overflow-x-auto rounded-2xl border"
      role="region"
      aria-label="Comparison table"
      tabIndex={0}
    >
      {sync}
      <table className="w-full min-w-[40rem] table-fixed border-collapse text-left">
        <caption className="sr-only">
          Comparing {items.map((p) => `${p.brand} ${p.model}`).join(", ")}
        </caption>
        <colgroup>
          <col className="w-36" />
          {items.map((p) => (
            <col key={p.id} />
          ))}
          {canAdd ? <col /> : null}
        </colgroup>
        <thead>
          <tr className="align-top">
            <td className="p-4" />
            {items.map((p) => (
              <th key={p.id} scope="col" className="p-4 font-normal">
                <div className="relative mx-auto aspect-[4/5] w-full max-w-40 rounded-xl bg-muted/40">
                  <Image
                    src={productImageSrc(p)}
                    alt=""
                    fill
                    sizes="160px"
                    className="object-contain p-3"
                  />
                </div>
                <Link
                  href={productPath(p)}
                  className="mt-3 block font-semibold underline-offset-4 hover:underline"
                >
                  {p.brand} {p.model}
                </Link>
                <Link
                  href={withoutItem(items, p.slug)}
                  className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <XIcon className="size-4" aria-hidden />
                  Remove
                  <span className="sr-only">
                    {" "}
                    {p.brand} {p.model}
                  </span>
                </Link>
              </th>
            ))}
            {canAdd ? (
              <td className="p-4 align-middle">
                <Link
                  href="/shop"
                  className="flex aspect-[4/5] w-full max-w-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <PlusIcon className="size-6" aria-hidden />
                  Add a phone
                </Link>
              </td>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label} className="border-t align-top">
              <th scope="row" className="p-4 text-sm font-medium text-muted-foreground">
                {row.label}
              </th>
              {items.map((p) => {
                const isBest = bests.get(row.label)!.has(p.id);
                return (
                  <td key={p.id} className={cn("p-4", isBest && "bg-success/10")}>
                    {row.value(p)}
                    {isBest ? (
                      <span className="mt-1 block text-xs font-semibold text-success">
                        {row.label === "Price" ? "Lowest" : "Best"}
                      </span>
                    ) : null}
                  </td>
                );
              })}
              {canAdd ? <td className="p-4" /> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
