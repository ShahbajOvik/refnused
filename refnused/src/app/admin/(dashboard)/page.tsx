import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { DataTable, PageHeader, Section, StatCard } from "@/app/admin/_components/kit";
import { requireStaff } from "@/auth/guards";
import { can } from "@/auth/roles";
import { FormMessage } from "@/components/auth/auth-card";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { getDashboard } from "@/lib/admin/dashboard";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

export default function AdminHomePage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<"/admin">, "searchParams">) {
  const { staff } = await requireStaff("admin.access", "/admin");
  await connection();
  const { denied } = await searchParams;
  const role = staff.role;
  const d = await getDashboard(db, { includeRevenue: can(role, "reports.view") });

  return (
    <>
      <PageHeader
        title={`Hello, ${staff.name.split(" ")[0]}`}
        description="Today at a glance (UK time)."
      />
      {denied ? (
        <div className="mb-6">
          <FormMessage>
            You don’t have permission to open that page. Ask an owner if you need access.
          </FormMessage>
        </div>
      ) : null}

      <div className="flex flex-col gap-6">
        {can(role, "quotes.manage") ? (
          <Section title="Trade-ins">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard
                label="Accepted today"
                value={d.quotes.acceptedToday}
                href="/admin/quotes?filter=awaiting"
              />
              <StatCard
                label="Received today"
                value={d.quotes.receivedToday}
                href="/admin/quotes?filter=to_inspect"
              />
              <StatCard
                label="To inspect"
                value={d.quotes.toInspect}
                href="/admin/quotes?filter=to_inspect"
                tone={d.quotes.toInspect ? "attention" : undefined}
              />
              <StatCard
                label="Waiting for customer"
                value={d.quotes.awaitingCustomer}
                href="/admin/quotes?filter=revised"
              />
            </div>
          </Section>
        ) : null}

        {can(role, "orders.manage") ? (
          <Section title="Orders">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <StatCard label="Paid today" value={d.orders.paidToday} href="/admin/orders" />
              <StatCard
                label="To fulfil"
                value={d.orders.toFulfil}
                href="/admin/orders?filter=to_fulfil"
                tone={d.orders.toFulfil ? "attention" : undefined}
              />
              <StatCard
                label="Ready to collect"
                value={d.orders.readyToCollect}
                href="/admin/orders?filter=in_transit"
              />
            </div>
          </Section>
        ) : null}

        {can(role, "payouts.approve") ? (
          <Section title="Payouts">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <StatCard
                label="Ready to pay"
                value={`${d.payouts.readyCount} · ${formatPrice(d.payouts.readyPence)}`}
                href="/admin/payouts"
                tone={d.payouts.readyCount ? "attention" : undefined}
              />
              <StatCard
                label="Paid today"
                value={formatPrice(d.payouts.paidTodayPence)}
                href="/admin/payouts?filter=paid"
              />
            </div>
          </Section>
        ) : null}

        {d.revenue ? (
          <Section title="Revenue (after refunds)">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard label="Today" value={formatPrice(d.revenue.todayPence)} />
              <StatCard label="Last 7 days" value={formatPrice(d.revenue.last7DaysPence)} />
              <StatCard label="Last 30 days" value={formatPrice(d.revenue.last30DaysPence)} />
            </div>
          </Section>
        ) : null}

        {can(role, "products.manage") ? (
          <Section title="Stock by store">
            <DataTable label="Stock by store">
              <thead>
                <tr>
                  <th scope="col">Store</th>
                  <th scope="col" className="text-right">
                    For sale
                  </th>
                  <th scope="col" className="text-right">
                    Value
                  </th>
                  <th scope="col" className="text-right">
                    Drafts
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.stock.map((s) => (
                  <tr key={`${s.storeName}-${s.storeTown}`}>
                    <th scope="row" className="font-medium text-foreground">
                      {s.storeName}, {s.storeTown}
                    </th>
                    <td className="text-right tabular-nums">{s.listed}</td>
                    <td className="text-right tabular-nums">{formatPrice(s.valuePence)}</td>
                    <td className="text-right tabular-nums">{s.drafts}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Section>
        ) : null}
      </div>
    </>
  );
}
