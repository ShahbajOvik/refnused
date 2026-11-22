import { and, asc, eq, gte, inArray, sql, sum } from "drizzle-orm";

import { mysqlDatetime } from "@refnused/database/db/datetime";

import { orders, payments, payouts, products, quotes, stores } from "@refnused/database/db/schema";
import type { AppDb } from "@refnused/database/db/types";

import { startOfLondonDay } from "./time";

/** Numbers for the admin dashboard. "Today" is the London calendar day. */
export type Dashboard = {
  quotes: {
    acceptedToday: number;
    receivedToday: number;
    toInspect: number;
    awaitingCustomer: number;
  };
  orders: { paidToday: number; toFulfil: number; readyToCollect: number };
  payouts: { readyCount: number; readyPence: number; paidTodayPence: number };
  stock: {
    storeName: string;
    storeTown: string;
    listed: number;
    valuePence: number;
    drafts: number;
  }[];
  revenue: { todayPence: number; last7DaysPence: number; last30DaysPence: number } | null;
};

const PAID = [
  "paid",
  "processing",
  "dispatched",
  "ready_for_collection",
  "completed",
  "partially_refunded",
] as const;

export async function getDashboard(
  db: AppDb,
  options: { now?: Date; includeRevenue: boolean },
): Promise<Dashboard> {
  const now = options.now ?? new Date();
  const today = startOfLondonDay(now);
  const n = (v: unknown) => Number(v ?? 0);

  const [quoteRow] = await db
    .select({
      acceptedToday: sql<number>`cast(sum(case when ${quotes.acceptedAt} >= cast(${mysqlDatetime(today)} as datetime(3)) then 1 else 0 end) as signed)`,
      receivedToday: sql<number>`cast(sum(case when ${quotes.receivedAt} >= cast(${mysqlDatetime(today)} as datetime(3)) then 1 else 0 end) as signed)`,
      toInspect: sql<number>`cast(sum(case when ${quotes.status} in ('received', 'inspecting') then 1 else 0 end) as signed)`,
      awaitingCustomer: sql<number>`cast(sum(case when ${quotes.status} = 'revised' then 1 else 0 end) as signed)`,
    })
    .from(quotes);

  const [orderRow] = await db
    .select({
      paidToday: sql<number>`cast(sum(case when ${orders.placedAt} >= cast(${mysqlDatetime(today)} as datetime(3)) then 1 else 0 end) as signed)`,
      toFulfil: sql<number>`cast(sum(case when ${orders.status} in ('paid', 'processing') then 1 else 0 end) as signed)`,
      readyToCollect: sql<number>`cast(sum(case when ${orders.status} = 'ready_for_collection' then 1 else 0 end) as signed)`,
    })
    .from(orders);

  const [payoutRow] = await db
    .select({
      readyCount: sql<number>`cast(sum(case when ${payouts.status} = 'pending' and ${quotes.status} = 'approved' then 1 else 0 end) as signed)`,
      readyPence: sql<number>`cast(coalesce(sum(case when ${payouts.status} = 'pending' and ${quotes.status} = 'approved' then ${payouts.amountPence} end), 0) as signed)`,
      paidTodayPence: sql<number>`cast(coalesce(sum(case when ${payouts.status} = 'paid' and ${payouts.paidAt} >= cast(${mysqlDatetime(today)} as datetime(3)) then ${payouts.amountPence} end), 0) as signed)`,
    })
    .from(payouts)
    .innerJoin(quotes, eq(payouts.quoteId, quotes.id));

  const stock = await db
    .select({
      storeName: stores.name,
      storeTown: stores.town,
      listed: sql<number>`cast(sum(case when ${products.status} = 'listed' then 1 else 0 end) as signed)`,
      valuePence: sql<number>`cast(coalesce(sum(case when ${products.status} = 'listed' then ${products.pricePence} end), 0) as signed)`,
      drafts: sql<number>`cast(sum(case when ${products.status} = 'draft' then 1 else 0 end) as signed)`,
    })
    .from(stores)
    .leftJoin(products, eq(products.storeId, stores.id))
    .where(eq(stores.isActive, true))
    .groupBy(stores.id)
    .orderBy(asc(stores.name), asc(stores.town));

  let revenue: Dashboard["revenue"] = null;
  if (options.includeRevenue) {
    const since = async (from: Date) => {
      const [row] = await db
        .select({
          gross: sum(orders.totalPence),
          refunded: sql<number>`coalesce(sum(${payments.amountRefundedPence}), 0)`,
        })
        .from(orders)
        .leftJoin(payments, eq(payments.orderId, orders.id))
        .where(and(inArray(orders.status, [...PAID, "refunded"]), gte(orders.placedAt, from)));
      return n(row?.gross) - n(row?.refunded);
    };
    const [todayPence, last7DaysPence, last30DaysPence] = await Promise.all([
      since(today),
      since(startOfLondonDay(now, 6)),
      since(startOfLondonDay(now, 29)),
    ]);
    revenue = { todayPence, last7DaysPence, last30DaysPence };
  }

  return {
    quotes: {
      acceptedToday: n(quoteRow?.acceptedToday),
      receivedToday: n(quoteRow?.receivedToday),
      toInspect: n(quoteRow?.toInspect),
      awaitingCustomer: n(quoteRow?.awaitingCustomer),
    },
    orders: {
      paidToday: n(orderRow?.paidToday),
      toFulfil: n(orderRow?.toFulfil),
      readyToCollect: n(orderRow?.readyToCollect),
    },
    payouts: {
      readyCount: n(payoutRow?.readyCount),
      readyPence: n(payoutRow?.readyPence),
      paidTodayPence: n(payoutRow?.paidTodayPence),
    },
    stock: stock.map((s) => ({
      ...s,
      listed: n(s.listed),
      valuePence: n(s.valuePence),
      drafts: n(s.drafts),
    })),
    revenue,
  };
}
