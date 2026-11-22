import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import {
  DataTable,
  Empty,
  FilterTabs,
  PageHeader,
  SearchForm,
  StatusPill,
} from "@/app/admin/_components/kit";
import { requireStaff } from "@/auth/guards";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@refnused/database/db";
import { listProductsAdmin } from "@/lib/admin/intake";
import { formatPrice } from "@refnused/database/lib/format";

import { ProductEditor } from "./product-editor";

export const metadata: Metadata = { title: "Products" };

const STATUSES = {
  all: "All",
  listed: "Listed",
  draft: "Drafts",
  reserved: "Reserved",
  sold: "Sold",
  returned: "Returned",
  withdrawn: "Withdrawn",
} as const;

export default function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  return (
    <>
      <PageHeader
        title="Products"
        description="Units in stock. Change price or status here; add new items with device intake."
        actions={
          <Button asChild className="min-h-11">
            <Link href="/admin/intake">Add an item</Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Products searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Products({ searchParams }: Pick<PageProps<"/admin/products">, "searchParams">) {
  await requireStaff("products.manage", "/admin/products");
  await connection();
  const params = await searchParams;
  const status =
    typeof params.status === "string" && params.status in STATUSES ? params.status : "all";
  const q = typeof params.q === "string" ? params.q : undefined;
  const rows = await listProductsAdmin(db, {
    status: status === "all" ? undefined : status,
    search: q,
  });
  return (
    <>
      <FilterTabs
        label="Product status"
        current={status}
        tabs={Object.entries(STATUSES).map(([key, label]) => ({
          key,
          label,
          href: `/admin/products?status=${key}`,
        }))}
      />
      <SearchForm
        action="/admin/products"
        defaultValue={q}
        placeholder="IMEI, serial number, model or slug"
      />
      {rows.length === 0 ? (
        <Empty>No units found.</Empty>
      ) : (
        <DataTable label="Products">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Grade · battery</th>
              <th scope="col">Store</th>
              <th scope="col">Status</th>
              <th scope="col">Ready to list</th>
              <th scope="col">Edit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.status === "draft" || p.status === "withdrawn" ? (
                    <span className="font-medium">{p.device}</span>
                  ) : (
                    <Link
                      href={`/shop/${p.brandSlug}/${p.slug}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {p.device}
                    </Link>
                  )}
                  <span className="block font-mono text-xs text-muted-foreground">
                    {p.identifier}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatPrice(p.pricePence)}
                  </span>
                </td>
                <td>
                  {p.grade}
                  {p.batteryHealthPercent !== null ? ` · ${p.batteryHealthPercent}%` : ""}
                </td>
                <td>{p.storeName}</td>
                <td>
                  <StatusPill status={p.status} />
                </td>
                <td className="text-xs">
                  {!p.certificateRequired
                    ? "Certificate not needed"
                    : p.hasCertificate
                      ? "Certificate ✓"
                      : "No certificate"}
                  <span className="block">{p.photos} photos</span>
                </td>
                <td>
                  <ProductEditor
                    productId={p.id}
                    label={p.device}
                    pricePence={p.pricePence}
                    status={p.status}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </>
  );
}
