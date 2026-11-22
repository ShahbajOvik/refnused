import { and, desc, eq, inArray, ne } from "drizzle-orm";

import {
  brands,
  deviceModels,
  inspections,
  modelVariants,
  orders,
  payouts,
  quotes,
  stores,
} from "../../db/schema";
import type { AppDb } from "../../db/types";
import { recordAudit, type RequestMeta } from "../audit";
import { formatDate } from "../format";

/*
 * A customer's trade-in quotes, with a status timeline and the revised-
 * offer decision (accept, or ask for the phone back).
 */

export type TimelineStep = {
  key: string;
  label: string;
  state: "done" | "current" | "upcoming" | "failed";
  date?: Date | null;
  detail?: string;
};

export type QuoteSummary = {
  id: string;
  reference: string;
  device: string;
  status: string;
  offeredPricePence: number;
  priceLockedUntil: Date;
  deliveryMethod: string | null;
  dropOffStore: string | null;
  acceptedAt: Date | null;
  receivedAt: Date | null;
  createdAt: Date;
  inspection: {
    inspectedAt: Date;
    actualGrade: string;
    revisedPricePence: number | null;
    revisedOfferStatus: "not_required" | "pending" | "accepted" | "declined";
    checkmendResult: string | null;
    notes: string | null;
  } | null;
  payout: {
    amountPence: number;
    status: string;
    method: string;
    paidAt: Date | null;
    accountNumberLast4: string | null;
  } | null;
  /** Trade-in value already spent on an order. */
  creditedToOrder: { orderNumber: string; creditPence: number } | null;
};

const IN_PROGRESS = new Set(["accepted", "received", "inspecting", "revised", "approved"]);

export function isQuoteInProgress(status: string) {
  return IN_PROGRESS.has(status);
}

/** The steps a trade-in goes through, for the account timeline. Pure. */
export function quoteTimeline(q: QuoteSummary): TimelineStep[] {
  const steps: TimelineStep[] = [];
  const failedEnd = ["rejected", "returned", "expired", "cancelled"].includes(q.status);
  const revised = q.inspection?.revisedPricePence != null;
  const paid = q.payout?.status === "paid" || q.status === "paid";

  steps.push({
    key: "accepted",
    label: "Quote accepted",
    state: "done",
    date: q.acceptedAt ?? q.createdAt,
    detail: `Offer £${(q.offeredPricePence / 100).toFixed(2)}`,
  });

  const received = Boolean(q.receivedAt);
  steps.push({
    key: "received",
    label: q.deliveryMethod === "store_drop_off" ? "Dropped off in store" : "Phone received",
    state: received ? "done" : failedEnd ? "upcoming" : "current",
    date: q.receivedAt,
    detail: received
      ? undefined
      : q.status === "accepted"
        ? `Send or drop off your phone by ${formatDate(q.priceLockedUntil)} to keep this price.`
        : undefined,
  });

  const inspected = Boolean(q.inspection);
  steps.push({
    key: "inspected",
    label: "Checked by our team",
    state: inspected ? "done" : received && !failedEnd ? "current" : "upcoming",
    date: q.inspection?.inspectedAt,
    detail: q.inspection ? `Condition: grade ${q.inspection.actualGrade}` : undefined,
  });

  if (revised) {
    const status = q.inspection!.revisedOfferStatus;
    steps.push({
      key: "revised",
      label: `Offer revised to £${(q.inspection!.revisedPricePence! / 100).toFixed(2)}`,
      state: status === "pending" ? "current" : status === "declined" ? "failed" : "done",
      detail:
        status === "pending"
          ? "Accept the new offer, or ask for your phone back free of charge."
          : status === "accepted"
            ? "You accepted the new offer."
            : "You asked for your phone back.",
    });
  }

  if (failedEnd) {
    const labels: Record<string, string> = {
      rejected: "We couldn’t accept this phone",
      returned: "Phone returned to you",
      expired: "Quote expired",
      cancelled: "Quote cancelled",
    };
    steps.push({
      key: q.status,
      label: labels[q.status]!,
      state: q.status === "returned" ? "done" : "failed",
      detail:
        q.status === "rejected" && q.inspection?.checkmendResult
          ? "It didn’t pass our CheckMEND check (lost, stolen, blocked or on finance)."
          : undefined,
    });
    return steps;
  }

  const amount = q.payout?.amountPence ?? q.inspection?.revisedPricePence ?? q.offeredPricePence;
  steps.push({
    key: "paid",
    label: paid ? "Paid" : "Payment",
    state: paid
      ? "done"
      : q.status === "approved" || q.inspection?.revisedOfferStatus === "accepted"
        ? "current"
        : "upcoming",
    date: q.payout?.paidAt,
    detail: q.creditedToOrder
      ? `£${(q.creditedToOrder.creditPence / 100).toFixed(2)} used on order ${q.creditedToOrder.orderNumber}${
          q.payout?.status !== "cancelled" && q.payout
            ? `, £${(q.payout.amountPence / 100).toFixed(2)} to your bank`
            : ""
        }`
      : q.payout?.accountNumberLast4
        ? `£${(amount / 100).toFixed(2)} to account ending ${q.payout.accountNumberLast4}`
        : undefined,
  });
  return steps;
}

export async function listCustomerQuotes(db: AppDb, customerId: string): Promise<QuoteSummary[]> {
  const rows = await db
    .select({
      id: quotes.id,
      reference: quotes.reference,
      brand: brands.name,
      model: deviceModels.name,
      storageGb: modelVariants.storageGb,
      status: quotes.status,
      offeredPricePence: quotes.offeredPricePence,
      priceLockedUntil: quotes.priceLockedUntil,
      deliveryMethod: quotes.deliveryMethod,
      storeName: stores.name,
      storeTown: stores.town,
      acceptedAt: quotes.acceptedAt,
      receivedAt: quotes.receivedAt,
      createdAt: quotes.createdAt,
      payoutAmount: payouts.amountPence,
      payoutStatus: payouts.status,
      payoutMethod: payouts.method,
      paidAt: payouts.paidAt,
      last4: payouts.accountNumberLast4,
    })
    .from(quotes)
    .innerJoin(modelVariants, eq(quotes.variantId, modelVariants.id))
    .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .leftJoin(stores, eq(quotes.dropOffStoreId, stores.id))
    .leftJoin(payouts, eq(payouts.quoteId, quotes.id))
    .where(and(eq(quotes.customerId, customerId), ne(quotes.status, "offered")))
    .orderBy(desc(quotes.createdAt));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [inspectionRows, creditRows] = await Promise.all([
    db
      .select()
      .from(inspections)
      .where(inArray(inspections.quoteId, ids))
      .orderBy(desc(inspections.inspectedAt)),
    db
      .select({
        quoteId: orders.tradeInQuoteId,
        orderNumber: orders.orderNumber,
        creditPence: orders.tradeInCreditPence,
      })
      .from(orders)
      .where(and(inArray(orders.tradeInQuoteId, ids), ne(orders.status, "cancelled"))),
  ]);
  const latestInspection = new Map<string, (typeof inspectionRows)[number]>();
  for (const row of inspectionRows) {
    if (!latestInspection.has(row.quoteId)) latestInspection.set(row.quoteId, row);
  }
  const credit = new Map(creditRows.map((c) => [c.quoteId!, c]));

  return rows.map((r) => {
    const insp = latestInspection.get(r.id);
    const c = credit.get(r.id);
    return {
      id: r.id,
      reference: r.reference,
      device: `${r.brand} ${r.model}, ${r.storageGb}GB`,
      status: r.status,
      offeredPricePence: r.offeredPricePence,
      priceLockedUntil: r.priceLockedUntil,
      deliveryMethod: r.deliveryMethod,
      dropOffStore: r.storeName ? `${r.storeName}, ${r.storeTown}` : null,
      acceptedAt: r.acceptedAt,
      receivedAt: r.receivedAt,
      createdAt: r.createdAt,
      inspection: insp
        ? {
            inspectedAt: insp.inspectedAt,
            actualGrade: insp.actualGrade,
            revisedPricePence: insp.revisedPricePence,
            revisedOfferStatus: insp.revisedOfferStatus,
            checkmendResult: insp.checkmendResult,
            notes: insp.notes,
          }
        : null,
      payout:
        r.payoutStatus && r.payoutAmount != null
          ? {
              amountPence: r.payoutAmount,
              status: r.payoutStatus,
              method: r.payoutMethod!,
              paidAt: r.paidAt,
              accountNumberLast4: r.last4,
            }
          : null,
      creditedToOrder: c ? { orderNumber: c.orderNumber, creditPence: c.creditPence } : null,
    };
  });
}

export type RevisedOfferResult =
  | { ok: true; decision: "accept" | "return"; payoutPence: number }
  | { ok: false; reason: "not_found" | "no_pending_offer" | "credited_to_order" };

/**
 * The customer's answer to a revised offer.
 * accept: the quote is approved and the payout becomes the revised price
 *   (less any of it already used as order credit).
 * return: no payout; staff send the phone back (then mark it returned).
 */
export async function respondToRevisedOffer(
  db: AppDb,
  input: { customerId: string; quoteId: string; decision: "accept" | "return" },
  options: { meta?: RequestMeta } = {},
): Promise<RevisedOfferResult> {
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const [quote] = await tx
      .select({ id: quotes.id, status: quotes.status, reference: quotes.reference })
      .from(quotes)
      .where(and(eq(quotes.id, input.quoteId), eq(quotes.customerId, input.customerId)))
      .for("update");
    if (!quote) return { ok: false, reason: "not_found" } as const;

    const [inspection] = await tx
      .select({
        id: inspections.id,
        revisedPricePence: inspections.revisedPricePence,
        revisedOfferStatus: inspections.revisedOfferStatus,
      })
      .from(inspections)
      .where(eq(inspections.quoteId, quote.id))
      .orderBy(desc(inspections.inspectedAt))
      .limit(1);
    if (
      quote.status !== "revised" ||
      !inspection ||
      inspection.revisedOfferStatus !== "pending" ||
      inspection.revisedPricePence == null
    ) {
      return { ok: false, reason: "no_pending_offer" } as const;
    }

    const [credit] = await tx
      .select({ orderNumber: orders.orderNumber, creditPence: orders.tradeInCreditPence })
      .from(orders)
      .where(and(eq(orders.tradeInQuoteId, quote.id), ne(orders.status, "cancelled")));
    // The value was already spent on an order: returning the phone needs a person.
    if (input.decision === "return" && credit) {
      return { ok: false, reason: "credited_to_order" } as const;
    }

    const [payout] = await tx
      .select({ id: payouts.id, amountPence: payouts.amountPence, status: payouts.status })
      .from(payouts)
      .where(eq(payouts.quoteId, quote.id))
      .for("update");

    if (input.decision === "accept") {
      const payoutPence = Math.max(0, inspection.revisedPricePence - (credit?.creditPence ?? 0));
      await tx
        .update(inspections)
        .set({ revisedOfferStatus: "accepted" })
        .where(eq(inspections.id, inspection.id));
      await tx.update(quotes).set({ status: "approved" }).where(eq(quotes.id, quote.id));
      if (payout && payout.status === "pending") {
        await tx
          .update(payouts)
          .set(
            payoutPence > 0
              ? { amountPence: payoutPence }
              : { status: "cancelled", failureReason: "Revised offer fully used as order credit" },
          )
          .where(eq(payouts.id, payout.id));
      }
      await recordAudit(
        tx,
        {
          actorType: "customer",
          actorId: input.customerId,
          action: "quote.revised_offer_accepted",
          entityType: "quote",
          entityId: quote.id,
          changes: {
            before: { payoutPence: payout?.amountPence ?? null },
            after: {
              revisedPricePence: inspection.revisedPricePence,
              payoutPence,
              // Credit already given above the revised price: staff to follow up.
              creditShortfallPence: credit
                ? Math.max(0, credit.creditPence - inspection.revisedPricePence)
                : 0,
            },
          },
        },
        options.meta,
      );
      return { ok: true, decision: "accept", payoutPence } as const;
    }

    await tx
      .update(inspections)
      .set({ revisedOfferStatus: "declined" })
      .where(eq(inspections.id, inspection.id));
    if (payout && payout.status === "pending") {
      await tx
        .update(payouts)
        .set({ status: "cancelled", failureReason: "Customer asked for the phone back" })
        .where(eq(payouts.id, payout.id));
    }
    await recordAudit(
      tx,
      {
        actorType: "customer",
        actorId: input.customerId,
        action: "quote.revised_offer_declined",
        entityType: "quote",
        entityId: quote.id,
        changes: { after: { revisedPricePence: inspection.revisedPricePence, return: true } },
      },
      options.meta,
    );
    return { ok: true, decision: "return", payoutPence: 0 } as const;
  });
}
