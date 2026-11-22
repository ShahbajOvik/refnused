import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { DataTable, PageHeader, Section, StatusPill } from "@/app/admin/_components/kit";
import { requireStaff } from "@/auth/guards";
import { can } from "@/auth/roles";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@refnused/database/db";
import { listCustomerQuotes } from "@refnused/database/lib/account/quotes";
import { getCustomerAdmin, listAudit } from "@/lib/admin/people";
import { formatDate, formatPrice } from "@refnused/database/lib/format";
import { listCustomerOrders } from "@refnused/database/lib/orders/order-service";

export const metadata: Metadata = { title: "Customer" };

export default function CustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Customer params={params} />
    </Suspense>
  );
}

async function Customer({ params }: Pick<PageProps<"/admin/customers/[id]">, "params">) {
  const { staff } = await requireStaff("customers.view", "/admin/customers");
  await connection();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const customer = await getCustomerAdmin(db, id);
  if (!customer) notFound();
  const [quotes, orders, activity] = await Promise.all([
    listCustomerQuotes(db, id),
    listCustomerOrders(db, id),
    can(staff.role, "audit.view")
      ? listAudit(db, { entityType: "customer", entityId: id, limit: 20 })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <Link
        href="/admin/customers"
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        ← Customers
      </Link>
      <PageHeader
        title={customer.deletedAt ? "Deleted customer" : (customer.name ?? customer.email)}
        description={
          customer.deletedAt
            ? `Account deleted ${formatDate(customer.deletedAt)}. Records kept anonymised.`
            : `${customer.email}${customer.phone ? ` · ${customer.phone}` : ""} · customer since ${formatDate(customer.createdAt)} · marketing: ${
                customer.marketingEmail || customer.marketingSms
                  ? [customer.marketingEmail && "email", customer.marketingSms && "SMS"]
                      .filter(Boolean)
                      .join(" and ")
                  : "no"
              }`
        }
      />
      <div className="flex flex-col gap-6">
        <Section title={`Trade-ins (${quotes.length})`}>
          {quotes.length ? (
            <DataTable label="Trade-ins">
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Offer</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id}>
                    <td>
                      {can(staff.role, "quotes.manage") ? (
                        <Link href={`/admin/quotes/${q.id}`} className="text-primary underline">
                          {q.reference}
                        </Link>
                      ) : (
                        q.reference
                      )}
                    </td>
                    <td>{q.device}</td>
                    <td className="tabular-nums">{formatPrice(q.offeredPricePence)}</td>
                    <td>
                      <StatusPill status={q.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ) : (
            <p className="text-sm text-muted-foreground">None.</p>
          )}
        </Section>
        <Section title={`Orders (${orders.length})`}>
          {orders.length ? (
            <DataTable label="Orders">
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Total</th>
                  <th scope="col">Status</th>
                  <th scope="col">Returns / warranty</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      {can(staff.role, "orders.manage") ? (
                        <Link href={`/admin/orders/${o.id}`} className="text-primary underline">
                          {o.orderNumber}
                        </Link>
                      ) : (
                        o.orderNumber
                      )}
                    </td>
                    <td className="tabular-nums">{formatPrice(o.totalPence)}</td>
                    <td>
                      <StatusPill status={o.status} />
                    </td>
                    <td className="text-xs">
                      {o.requests.map((r) => `${r.reference} (${r.status})`).join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ) : (
            <p className="text-sm text-muted-foreground">None.</p>
          )}
        </Section>
        {activity.length ? (
          <Section title="Account activity">
            <ul className="flex flex-col gap-1 text-sm">
              {activity.map((a) => (
                <li key={a.id}>
                  <span className="text-muted-foreground">{formatDate(a.at, "short")}</span>{" "}
                  {a.action}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
    </>
  );
}
