import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { z } from "zod";

import {
  brands,
  checkmendResult,
  customers,
  deviceModels,
  inspections,
  modelVariants,
  payouts,
  quotes,
  stores,
  tradeInGrade,
  tradeInPrices,
} from "../../db/schema";
import { mysqlDatetime } from "../../db/datetime";
import type { AppDb } from "../../db/types";
import { ActionError } from "../action-error";
import { recordAudit, type RequestMeta } from "../audit";

/*
 * Quote queue and inspections. A quote moves:
 *   accepted → received → (inspection) → approved | revised | rejected
 *   revised → approved (customer accepts) | returned (customer declines)
 */

export const QUEUE_FILTERS = {
  awaiting: { label: "Waiting for the phone", statuses: ["accepted"] },
  to_inspect: { label: "To inspect", statuses: ["received", "inspecting"] },
  revised: { label: "Waiting for customer", statuses: ["revised"] },
  approved: { label: "Approved (to pay)", statuses: ["approved"] },
  closed: { label: "Closed", statuses: ["paid", "returned", "rejected", "expired", "cancelled"] },
} as const;
export type QueueFilter = keyof typeof QUEUE_FILTERS;

export type QueueRow = {
  id: string;
  reference: string;
  status: string;
  device: string;
  imei: string | null;
  customerName: string | null;
  customerEmail: string | null;
  offeredPricePence: number;
  deliveryMethod: string | null;
  dropOffStore: string | null;
  acceptedAt: Date | null;
  receivedAt: Date | null;
  priceLockedUntil: Date;
  declinedRevision: boolean;
};

const device = sql<string>`concat(${brands.name}, ' ', ${deviceModels.name}, ', ', ${modelVariants.storageGb}, 'GB, ', ${modelVariants.colour})`;

export async function listQuoteQueue(
  db: AppDb,
  filter: QueueFilter,
  search?: string,
): Promise<QueueRow[]> {
  const q = search?.trim();
  const rows = await db
    .select({
      id: quotes.id,
      reference: quotes.reference,
      status: quotes.status,
      device,
      imei: quotes.imei,
      customerName: quotes.contactName,
      customerEmail: quotes.contactEmail,
      offeredPricePence: quotes.offeredPricePence,
      deliveryMethod: quotes.deliveryMethod,
      dropOffStore: sql<string | null>`concat(${stores.name}, ', ', ${stores.town})`,
      acceptedAt: quotes.acceptedAt,
      receivedAt: quotes.receivedAt,
      priceLockedUntil: quotes.priceLockedUntil,
      declinedRevision:
        sql<boolean>`exists (select 1 from ${inspections} where ${inspections.quoteId} = ${quotes.id} and ${inspections.revisedOfferStatus} = 'declined')`.mapWith(
          Boolean,
        ),
    })
    .from(quotes)
    .innerJoin(modelVariants, eq(quotes.variantId, modelVariants.id))
    .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .leftJoin(stores, eq(quotes.dropOffStoreId, stores.id))
    .where(
      and(
        inArray(quotes.status, [...QUEUE_FILTERS[filter].statuses]),
        q
          ? or(
              like(quotes.reference, `%${q}%`),
              like(quotes.contactEmail, `%${q}%`),
              like(quotes.contactName, `%${q}%`),
              eq(quotes.imei, q),
            )
          : undefined,
      ),
    )
    .orderBy(filter === "closed" ? desc(quotes.updatedAt) : quotes.acceptedAt)
    .limit(200);
  return rows;
}

export type QuoteDetail = NonNullable<Awaited<ReturnType<typeof getQuoteDetail>>>;

export async function getQuoteDetail(db: AppDb, quoteId: string) {
  const [quote] = await db
    .select({
      id: quotes.id,
      reference: quotes.reference,
      status: quotes.status,
      variantId: quotes.variantId,
      device,
      quotedGrade: quotes.quotedGrade,
      answers: quotes.answers,
      offerBreakdown: quotes.offerBreakdown,
      offeredPricePence: quotes.offeredPricePence,
      imei: quotes.imei,
      deliveryMethod: quotes.deliveryMethod,
      contactName: quotes.contactName,
      contactEmail: quotes.contactEmail,
      contactPhone: quotes.contactPhone,
      acceptedAt: quotes.acceptedAt,
      receivedAt: quotes.receivedAt,
      priceLockedUntil: quotes.priceLockedUntil,
      customerId: quotes.customerId,
    })
    .from(quotes)
    .innerJoin(modelVariants, eq(quotes.variantId, modelVariants.id))
    .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .where(eq(quotes.id, quoteId));
  if (!quote) return null;
  const [inspectionRows, [payout], gradePrices] = await Promise.all([
    db
      .select()
      .from(inspections)
      .where(eq(inspections.quoteId, quoteId))
      .orderBy(desc(inspections.inspectedAt)),
    db
      .select({
        amountPence: payouts.amountPence,
        status: payouts.status,
        method: payouts.method,
        last4: payouts.accountNumberLast4,
        paidAt: payouts.paidAt,
      })
      .from(payouts)
      .where(eq(payouts.quoteId, quoteId)),
    db
      .select({ grade: tradeInPrices.grade, pricePence: tradeInPrices.pricePence })
      .from(tradeInPrices)
      .where(eq(tradeInPrices.variantId, quote.variantId)),
  ]);
  return {
    ...quote,
    inspections: inspectionRows,
    payout: payout ?? null,
    /** What we pay for this variant at each grade: a starting point for a revised offer. */
    gradePrices: Object.fromEntries(gradePrices.map((g) => [g.grade, g.pricePence])) as Partial<
      Record<(typeof tradeInGrade.enumValues)[number], number>
    >,
  };
}

async function loadQuoteForUpdate(tx: AppDb, quoteId: string) {
  const [quote] = await tx
    .select({
      id: quotes.id,
      status: quotes.status,
      reference: quotes.reference,
      offeredPricePence: quotes.offeredPricePence,
    })
    .from(quotes)
    .where(eq(quotes.id, quoteId))
    .for("update");
  if (!quote) throw new ActionError("That quote doesn’t exist.");
  return quote;
}

export async function markQuoteReceived(
  db: AppDb,
  input: { quoteId: string; staffId: string },
  meta?: RequestMeta,
  now = new Date(),
) {
  await db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const quote = await loadQuoteForUpdate(tx, input.quoteId);
    if (quote.status !== "accepted")
      throw new ActionError("Only quotes waiting for the phone can be marked received.");
    await tx
      .update(quotes)
      .set({ status: "received", receivedAt: now })
      .where(eq(quotes.id, quote.id));
    await recordAudit(
      tx,
      {
        actorType: "staff",
        actorId: input.staffId,
        action: "quote.received",
        entityType: "quote",
        entityId: quote.id,
        changes: { before: { status: quote.status }, after: { status: "received" } },
      },
      meta,
    );
  });
}

export const inspectionSchema = z
  .object({
    quoteId: z.uuid(),
    actualGrade: z.enum(tradeInGrade.enumValues, "Choose the grade"),
    checkmendResult: z.enum(checkmendResult.enumValues, "Choose the CheckMEND result"),
    checkmendReference: z
      .string()
      .trim()
      .max(60)
      .optional()
      .transform((v) => v || null),
    notes: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .transform((v) => v || null),
    photos: z
      .array(
        z.object({ key: z.string().regex(/^inspections\/[\w/.-]+$/), alt: z.string().max(200) }),
      )
      .max(12)
      .default([]),
    /** Pounds. Empty: keep the original offer. */
    revisedPounds: z
      .union([z.literal(""), z.coerce.number().min(0).max(5000)])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : Math.round(v * 100))),
  })
  .refine(
    (v) => v.checkmendResult === "clear" || v.checkmendResult === "error" || !v.revisedPounds,
    {
      message: "Don’t set a revised offer for a phone that failed CheckMEND",
      path: ["revisedPounds"],
    },
  );

export type InspectionOutcome = "approved" | "revised" | "rejected" | "pending_check";

/**
 * Records an inspection and decides the quote:
 * - CheckMEND error: no decision yet (status inspecting), check again later;
 * - any other CheckMEND hit: rejected, payout cancelled;
 * - a revised price different from the offer: revised (customer decides);
 * - otherwise: approved, ready to pay.
 */
export async function recordInspection(
  db: AppDb,
  input: z.output<typeof inspectionSchema> & { staffId: string },
  meta?: RequestMeta,
  now = new Date(),
): Promise<{ outcome: InspectionOutcome; reference: string; offeredPricePence: number }> {
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const quote = await loadQuoteForUpdate(tx, input.quoteId);
    if (!["accepted", "received", "inspecting"].includes(quote.status)) {
      throw new ActionError("This quote has already been decided.");
    }
    const revised =
      input.revisedPounds !== null && input.revisedPounds !== quote.offeredPricePence
        ? input.revisedPounds
        : null;
    const outcome: InspectionOutcome =
      input.checkmendResult === "error"
        ? "pending_check"
        : input.checkmendResult !== "clear"
          ? "rejected"
          : revised !== null
            ? "revised"
            : "approved";

    await tx.insert(inspections).values({
      quoteId: quote.id,
      staffId: input.staffId,
      actualGrade: input.actualGrade,
      revisedPricePence: outcome === "revised" ? revised : null,
      revisedOfferStatus: outcome === "revised" ? "pending" : "not_required",
      checkmendResult: input.checkmendResult,
      checkmendReference: input.checkmendReference,
      notes: input.notes,
      photos: input.photos,
      inspectedAt: now,
    });
    const status = {
      pending_check: "inspecting",
      rejected: "rejected",
      revised: "revised",
      approved: "approved",
    } as const;
    await tx
      .update(quotes)
      .set({
        status: status[outcome],
        receivedAt: sql`coalesce(${quotes.receivedAt}, cast(${mysqlDatetime(now)} as datetime(3)))`,
      })
      .where(eq(quotes.id, quote.id));
    if (outcome === "rejected") {
      await tx
        .update(payouts)
        .set({ status: "cancelled", failureReason: `CheckMEND: ${input.checkmendResult}` })
        .where(and(eq(payouts.quoteId, quote.id), eq(payouts.status, "pending")));
    }
    await recordAudit(
      tx,
      {
        actorType: "staff",
        actorId: input.staffId,
        action: "quote.inspected",
        entityType: "quote",
        entityId: quote.id,
        changes: {
          before: { status: quote.status, offeredPricePence: quote.offeredPricePence },
          after: {
            status: status[outcome],
            actualGrade: input.actualGrade,
            checkmendResult: input.checkmendResult,
            revisedPricePence: outcome === "revised" ? revised : null,
            photos: input.photos.length,
          },
        },
      },
      meta,
    );
    return { outcome, reference: quote.reference, offeredPricePence: quote.offeredPricePence };
  });
}

/** After a declined revised offer, the phone has been posted back. */
export async function markQuoteReturned(
  db: AppDb,
  input: { quoteId: string; staffId: string },
  meta?: RequestMeta,
) {
  await db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const quote = await loadQuoteForUpdate(tx, input.quoteId);
    const [declined] = await tx
      .select({ id: inspections.id })
      .from(inspections)
      .where(
        and(eq(inspections.quoteId, quote.id), eq(inspections.revisedOfferStatus, "declined")),
      );
    if (!(quote.status === "rejected" || (quote.status === "revised" && declined))) {
      throw new ActionError(
        "Only rejected phones, or ones whose owner declined a revised offer, can be returned.",
      );
    }
    await tx.update(quotes).set({ status: "returned" }).where(eq(quotes.id, quote.id));
    await recordAudit(
      tx,
      {
        actorType: "staff",
        actorId: input.staffId,
        action: "quote.returned",
        entityType: "quote",
        entityId: quote.id,
        changes: { before: { status: quote.status }, after: { status: "returned" } },
      },
      meta,
    );
  });
}

/** Contact details for emailing the customer about a quote. */
export async function quoteContact(db: AppDb, quoteId: string) {
  const [row] = await db
    .select({
      name: quotes.contactName,
      email: sql<string | null>`coalesce(${quotes.contactEmail}, ${customers.email})`,
      reference: quotes.reference,
      device,
      offeredPricePence: quotes.offeredPricePence,
      payoutPence: payouts.amountPence,
    })
    .from(quotes)
    .innerJoin(modelVariants, eq(quotes.variantId, modelVariants.id))
    .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .leftJoin(customers, eq(quotes.customerId, customers.id))
    .leftJoin(payouts, eq(payouts.quoteId, quotes.id))
    .where(eq(quotes.id, quoteId));
  return row ?? null;
}
