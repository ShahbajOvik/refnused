import { and, asc, eq, gte, inArray, sql, sum } from "drizzle-orm";

import { orders, payments, payouts, products, quotes, stores } from "@/db/schema";
import type { AppDb } from "@/db/types";

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
      acceptedToday: sql<number>`count(*) filter (where ${quotes.acceptedAt} >= ${today.toISOString()})::int`,
      receivedToday: sql<number>`count(*) filter (where ${quotes.receivedAt} >= ${today.toISOString()})::int`,
      toInspect: sql<number>`count(*) filter (where ${quotes.status} in ('received', 'inspecting'))::int`,
      awaitingCustomer: sql<number>`count(*) filter (where ${quotes.status} = 'revised')::int`,
    })
    .from(quotes);

  const [orderRow] = await db
    .select({
      paidToday: sql<number>`count(*) filter (where ${orders.placedAt} >= ${today.toISOString()})::int`,
      toFulfil: sql<number>`count(*) filter (where ${orders.status} in ('paid', 'processing'))::int`,
      readyToCollect: sql<number>`count(*) filter (where ${orders.status} = 'ready_for_collection')::int`,
    })
    .from(orders);

  const [payoutRow] = await db
    .select({
      readyCount: sql<number>`count(*) filter (where ${payouts.status} = 'pending' and ${quotes.status} = 'approved')::int`,
      readyPence: sql<number>`coalesce(sum(${payouts.amountPence}) filter (where ${payouts.status} = 'pending' and ${quotes.status} = 'approved'), 0)::int`,
      paidTodayPence: sql<number>`coalesce(sum(${payouts.amountPence}) filter (where ${payouts.status} = 'paid' and ${payouts.paidAt} >= ${today.toISOString()}), 0)::int`,
    })
    .from(payouts)
    .innerJoin(quotes, eq(payouts.quoteId, quotes.id));

  const stock = await db
    .select({
      storeName: stores.name,
      storeTown: stores.town,
      listed: sql<number>`count(${products.id}) filter (where ${products.status} = 'listed')::int`,
      valuePence: sql<number>`coalesce(sum(${products.pricePence}) filter (where ${products.status} = 'listed'), 0)::int`,
      drafts: sql<number>`count(${products.id}) filter (where ${products.status} = 'draft')::int`,
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
