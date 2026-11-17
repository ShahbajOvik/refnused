import { createHash, randomBytes, randomInt } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import {
  brands,
  customers,
  deviceModels,
  modelVariants,
  payouts,
  quotes,
  stores,
} from "@/db/schema";
import type { AppDb } from "@/db/types";
import { recordAudit, type RequestMeta } from "@/lib/audit";
import { bankDetailsSchema, encryptBankDetails } from "@/lib/crypto/bank-details";
import type { FieldCipher } from "@/lib/crypto/field-encryption";
import { imeiSchema, ukPhoneSchema, ukPostcodeSchema } from "@/lib/validation/uk";

import { computeOffer, PRICE_LOCK_DAYS } from "./offer-service";
import { PricingError } from "./pricing";

export const answersSchema = z
  .record(z.string().max(40), z.string().max(40))
  .refine((a) => Object.keys(a).length <= 30, "Too many answers");

export const deliverySchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("postage_pack") }),
  z.object({ method: z.literal("print_label") }),
  z.object({ method: z.literal("store_drop_off"), storeId: z.uuid() }),
]);
export type DeliveryChoice = z.infer<typeof deliverySchema>;

const mustBeTrue = (message: string) => z.literal(true, { error: message });

export const createQuoteSchema = z.object({
  variantId: z.uuid(),
  answers: answersSchema,
  /** The offer the customer saw. If the server's price differs, we ask again. */
  expectedOfferPence: z.number().int().nonnegative(),
  delivery: deliverySchema,
  name: z.string().trim().min(2, "Enter your full name").max(100),
  email: z
    .email("Enter a valid email address")
    .max(254)
    .transform((v) => v.trim().toLowerCase()),
  phone: ukPhoneSchema,
  address: z.object({
    line1: z.string().trim().min(2, "Enter the first line of your address").max(100),
    line2: z
      .string()
      .trim()
      .max(100)
      .optional()
      .transform((v) => v || undefined),
    town: z.string().trim().min(2, "Enter your town or city").max(60),
    postcode: ukPostcodeSchema,
  }),
  imei: imeiSchema,
  bank: bankDetailsSchema,
  declarations: z.object({
    owner: mustBeTrue("Confirm you own this phone and can sell it"),
    activationLockOff: mustBeTrue("Confirm Find My / Google account lock is turned off"),
  }),
});
export type CreateQuoteInput = z.input<typeof createQuoteSchema>;

/** Statuses where a phone is still in the trade-in process. */
const OPEN_STATUSES = ["accepted", "received", "inspecting", "revised", "approved"] as const;

const REFERENCE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford: no I, L, O, U

export function generateQuoteReference() {
  let code = "";
  for (let i = 0; i < 6; i++) code += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  return `RU-Q-${code}`;
}

export function hashTrackingToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type CreateQuoteResult =
  | {
      ok: true;
      quoteId: string;
      reference: string;
      trackingToken: string;
      offerPence: number;
      priceLockedUntil: Date;
    }
  | { ok: false; reason: "price_changed"; offerPence: number }
  | {
      ok: false;
      reason: "not_acceptable_online" | "invalid_answers" | "unknown_store" | "imei_in_use";
    };

/**
 * Creates an accepted quote with a 14-day price lock. Recalculates the offer
 * from the database; the customer's price is only used to detect changes.
 */
export async function createQuote(
  db: AppDb,
  input: z.output<typeof createQuoteSchema>,
  options: { cipher: FieldCipher; now?: Date; meta?: RequestMeta },
): Promise<CreateQuoteResult> {
  const now = options.now ?? new Date();

  let offer;
  try {
    offer = await computeOffer(db, { variantId: input.variantId, answers: input.answers });
  } catch (error) {
    if (error instanceof PricingError) return { ok: false, reason: "invalid_answers" };
    throw error;
  }
  if (!offer.acceptableOnline) return { ok: false, reason: "not_acceptable_online" };
  if (offer.offerPence !== input.expectedOfferPence) {
    return { ok: false, reason: "price_changed", offerPence: offer.offerPence };
  }

  if (input.delivery.method === "store_drop_off") {
    const [store] = await db
      .select({ id: stores.id })
      .from(stores)
      .where(and(eq(stores.id, input.delivery.storeId), eq(stores.isActive, true)));
    if (!store) return { ok: false, reason: "unknown_store" };
  }

  const [openQuote] = await db
    .select({ id: quotes.id })
    .from(quotes)
    .where(and(eq(quotes.imei, input.imei), inArray(quotes.status, [...OPEN_STATUSES])))
    .limit(1);
  if (openQuote) return { ok: false, reason: "imei_in_use" };

  const trackingToken = randomBytes(24).toString("base64url");
  const priceLockedUntil = new Date(now.getTime() + PRICE_LOCK_DAYS * 86_400_000);
  const bank = encryptBankDetails(input.bank, options.cipher);

  const created = await db.transaction(async (tx) => {
    // Find or create the customer by email (case-insensitive).
    let [customer] = await tx
      .select({ id: customers.id, name: customers.name, phone: customers.phone })
      .from(customers)
      .where(sql`lower(${customers.email}) = ${input.email}`);
    if (!customer) {
      [customer] = await tx
        .insert(customers)
        .values({ email: input.email, name: input.name, phone: input.phone })
        .returning({ id: customers.id, name: customers.name, phone: customers.phone });
    } else if (!customer.name || !customer.phone) {
      await tx
        .update(customers)
        .set({ name: customer.name ?? input.name, phone: customer.phone ?? input.phone })
        .where(eq(customers.id, customer.id));
    }

    // Retry on the (unlikely) chance of a duplicate reference.
    for (let attempt = 0; attempt < 5; attempt++) {
      const reference = generateQuoteReference();
      const [quote] = await tx
        .insert(quotes)
        .values({
          reference,
          customerId: customer!.id,
          variantId: input.variantId,
          quotedGrade: offer.grade,
          answers: { version: 1, responses: input.answers },
          offeredPricePence: offer.offerPence,
          offerBreakdown: {
            grade: offer.grade,
            basePricePence: offer.basePricePence,
            deductions: offer.deductions,
            offerPence: offer.offerPence,
          },
          status: "accepted",
          priceLockedUntil,
          imei: input.imei,
          deliveryMethod: input.delivery.method,
          dropOffStoreId:
            input.delivery.method === "store_drop_off" ? input.delivery.storeId : null,
          acceptedAt: now,
          contactName: input.name,
          contactEmail: input.email,
          contactPhone: input.phone,
          contactAddress: input.address,
          trackingTokenHash: hashTrackingToken(trackingToken),
          ownershipDeclaredAt: now,
          activationLockOffDeclaredAt: now,
        })
        .onConflictDoNothing({ target: quotes.reference })
        .returning({ id: quotes.id, reference: quotes.reference });
      if (!quote) continue;

      await tx.insert(payouts).values({
        quoteId: quote.id,
        customerId: customer!.id,
        amountPence: offer.offerPence,
        method: "bank_transfer",
        status: "pending",
        reference: quote.reference,
        ...bank,
      });
      await recordAudit(
        tx as unknown as AppDb,
        {
          actorType: "customer",
          actorId: customer!.id,
          action: "quote.create",
          entityType: "quote",
          entityId: quote.id,
          // No bank details or IMEI in the audit log.
          changes: {
            after: {
              reference: quote.reference,
              offerPence: offer.offerPence,
              grade: offer.grade,
              delivery: input.delivery.method,
            },
          },
        },
        options.meta,
      );
      return quote;
    }
    throw new Error("Could not generate a unique quote reference");
  });

  return {
    ok: true,
    quoteId: created.id,
    reference: created.reference,
    trackingToken,
    offerPence: offer.offerPence,
    priceLockedUntil,
  };
}

/** Everything the tracking page and confirmation messages need. */
export async function getQuoteByTrackingToken(db: AppDb, token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [row] = await db
    .select({
      id: quotes.id,
      reference: quotes.reference,
      status: quotes.status,
      offeredPricePence: quotes.offeredPricePence,
      offerBreakdown: quotes.offerBreakdown,
      priceLockedUntil: quotes.priceLockedUntil,
      deliveryMethod: quotes.deliveryMethod,
      acceptedAt: quotes.acceptedAt,
      receivedAt: quotes.receivedAt,
      contactName: quotes.contactName,
      contactAddress: quotes.contactAddress,
      model: deviceModels.name,
      brand: brands.name,
      storageGb: modelVariants.storageGb,
      colour: modelVariants.colour,
      storeName: stores.name,
      storeStreet: stores.street,
      storeTown: stores.town,
      storePostcode: stores.postcode,
      storePhone: stores.phone,
    })
    .from(quotes)
    .innerJoin(modelVariants, eq(quotes.variantId, modelVariants.id))
    .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
    .innerJoin(brands, eq(deviceModels.brandId, brands.id))
    .leftJoin(stores, eq(quotes.dropOffStoreId, stores.id))
    .where(eq(quotes.trackingTokenHash, hashTrackingToken(token)));
  return row ?? null;
}
export type TrackedQuote = NonNullable<Awaited<ReturnType<typeof getQuoteByTrackingToken>>>;
