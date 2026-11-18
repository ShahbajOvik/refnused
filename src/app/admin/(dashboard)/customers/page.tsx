import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { DataTable, Empty, PageHeader, SearchForm } from "@/app/admin/_components/kit";
import { requireStaff } from "@/auth/guards";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { searchCustomers } from "@/lib/admin/people";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  return (
    <>
      <PageHeader
        title="Customers"
        description="Find a customer by email, name, phone, quote reference or order number."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Customers searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Customers({ searchParams }: Pick<PageProps<"/admin/customers">, "searchParams">) {
  await requireStaff("customers.view", "/admin/customers");
  await connection();
  const q = (await searchParams).q;
  const query = typeof q === "string" ? q : "";
  const rows = query ? await searchCustomers(db, query) : [];
  return (
    <>
      <SearchForm
        action="/admin/customers"
        defaultValue={query}
        placeholder="Email, name, phone, RU-Q-… or RU-…"
      />
      {!query ? (
        <Empty>Search to find a customer.</Empty>
      ) : rows.length === 0 ? (
        <Empty>No customers match “{query}”.</Empty>
      ) : (
        <DataTable label="Customers">
          <thead>
            <tr>
              <th scope="col">Customer</th>
              <th scope="col">Phone</th>
              <th scope="col">Trade-ins</th>
              <th scope="col">Orders</th>
              <th scope="col">Since</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link
                    href={`/admin/customers/${c.id}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {c.deletedAt ? "Deleted customer" : (c.name ?? c.email)}
                  </Link>
                  {c.deletedAt ? null : (
                    <span className="block text-xs break-all text-muted-foreground">{c.email}</span>
                  )}
                </td>
                <td>{c.phone ?? "—"}</td>
                <td className="tabular-nums">{c.quotes}</td>
                <td className="tabular-nums">{c.orders}</td>
                <td className="text-xs text-muted-foreground">
                  {formatDate(c.createdAt, "short")}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </>
  );
}
