// @vitest-environment node
import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  auditLog,
  customers,
  deviceModels,
  modelVariants,
  payouts,
  quoteAnswerOptions,
  quoteQuestions,
  quotes,
  stores,
} from "@/db/schema";
import { seed } from "@/db/seed";
import { sampleTradeInPence } from "@/db/seed/catalogue";
import type { AppDb } from "@/db/types";
import { decryptBankDetails } from "@/lib/crypto/bank-details";
import { consumeRateLimit, rateLimitKey } from "@/lib/security/rate-limit";
import { createTestDb, testCipher } from "@/test/db";
import { withImeiCheckDigit } from "@/lib/validation/uk";

import { getSellModel, listSellModelParams } from "./catalogue";
import { computeOffer, loadQuestionConfig, publicQuestions } from "./offer-service";
import {
  createQuote,
  createQuoteSchema,
  getQuoteByTrackingToken,
  hashTrackingToken,
  type CreateQuoteInput,
} from "./quote-service";

let db: AppDb;
let close: () => Promise<void>;
const cipher = testCipher();
let iphone15_128Black: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seed(db);
  const model = await getSellModel(db, "apple", "iphone-15");
  iphone15_128Black = model!.variants.find((v) => v.storageGb === 128 && v.colour === "Black")!.id;
});
afterAll(() => close?.());

const perfect = {
  network: "unlocked",
  powers_on: "yes",
  screen: "perfect",
  body: "perfect",
  battery: "good",
  biometrics: "works",
};

let imeiCounter = 100;
const freshImei = () => withImeiCheckDigit(`3511111111${String(imeiCounter++).padStart(4, "0")}`);

function input(overrides: Partial<CreateQuoteInput> = {}): CreateQuoteInput {
  return {
    variantId: iphone15_128Black,
    answers: perfect,
    expectedOfferPence: sampleTradeInPence(26000, 0, "A"),
    delivery: { method: "postage_pack" },
    name: "Jo Bloggs",
    email: `Jo.${randomBytes(3).toString("hex")}@Example.co.uk`,
    phone: "07700 900123",
    address: { line1: "1 Test Street", town: "North Shields", postcode: "ne29 6rr" },
    imei: freshImei(),
    bank: { accountHolderName: "Jo Bloggs", sortCode: "12-34-56", accountNumber: "12345678" },
    declarations: { owner: true, activationLockOff: true },
    ...overrides,
  };
}

const create = (i: CreateQuoteInput) => createQuote(db, createQuoteSchema.parse(i), { cipher });

describe("offers from database config", () => {
  it("loads questions in order, device questions first", async () => {
    const questions = await loadQuestionConfig(db);
    expect(questions.map((q) => q.key)).toEqual([
      "network",
      "powers_on",
      "screen",
      "body",
      "battery",
      "biometrics",
    ]);
  });

  it("never sends pricing data to the browser", async () => {
    const json = JSON.stringify(publicQuestions(await loadQuestionConfig(db)));
    expect(json).not.toMatch(/deduction|gradeCap/);
  });

  it("prices a perfect phone at the variant's grade A price", async () => {
    const offer = await computeOffer(db, { variantId: iphone15_128Black, answers: perfect });
    expect(offer).toMatchObject({ grade: "A", offerPence: sampleTradeInPence(26000, 0, "A") });
  });

  it("applies grade caps and deductions from the database", async () => {
    const offer = await computeOffer(db, {
      variantId: iphone15_128Black,
      answers: { ...perfect, screen: "light", battery: "poor", network: "locked" },
    });
    const gradeB = sampleTradeInPence(26000, 0, "B");
    expect(offer.grade).toBe("B");
    expect(offer.offerPence).toBe(Math.floor((gradeB - 2500 - 1000) / 100) * 100);
  });

  it("uses changes made in the database straight away", async () => {
    const [battery] = await db
      .select()
      .from(quoteQuestions)
      .where(eq(quoteQuestions.key, "battery"));
    await db
      .update(quoteAnswerOptions)
      .set({ deductionPence: 5000 })
      .where(
        and(eq(quoteAnswerOptions.questionId, battery!.id), eq(quoteAnswerOptions.key, "poor")),
      );
    const offer = await computeOffer(db, {
      variantId: iphone15_128Black,
      answers: { ...perfect, battery: "poor" },
    });
    expect(offer.deductions).toContainEqual(
      expect.objectContaining({ questionKey: "battery", amountPence: 5000 }),
    );
    await db
      .update(quoteAnswerOptions)
      .set({ deductionPence: 2500 })
      .where(
        and(eq(quoteAnswerOptions.questionId, battery!.id), eq(quoteAnswerOptions.key, "poor")),
      );
  });

  it("lists every active model for static generation", async () => {
    const params = await listSellModelParams(db);
    expect(params).toHaveLength(10);
    expect(params).toContainEqual({ brand: "samsung", model: "galaxy-s24" });
  });
});

describe("createQuote", () => {
  it("creates an accepted quote with a 14-day lock, contact details and declarations", async () => {
    const now = new Date("2026-11-17T12:00:00Z");
    const result = await createQuote(db, createQuoteSchema.parse(input()), { cipher, now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reference).toMatch(/^RU-Q-[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(result.priceLockedUntil.toISOString()).toBe("2026-12-01T12:00:00.000Z");

    const [quote] = await db.select().from(quotes).where(eq(quotes.id, result.quoteId));
    expect(quote).toMatchObject({
      status: "accepted",
      quotedGrade: "A",
      deliveryMethod: "postage_pack",
      contactPhone: "+447700900123",
      contactAddress: { line1: "1 Test Street", town: "North Shields", postcode: "NE29 6RR" },
    });
    expect(quote!.ownershipDeclaredAt).not.toBeNull();
    expect(quote!.activationLockOffDeclaredAt).not.toBeNull();
    // Only a hash of the tracking token is stored.
    expect(quote!.trackingTokenHash).toBe(hashTrackingToken(result.trackingToken));
    expect(JSON.stringify(quote)).not.toContain(result.trackingToken);
  });

  it("stores bank details encrypted on a pending payout", async () => {
    const result = await create(input());
    if (!result.ok) throw new Error("expected ok");
    const [payout] = await db.select().from(payouts).where(eq(payouts.quoteId, result.quoteId));
    expect(payout).toMatchObject({
      status: "pending",
      method: "bank_transfer",
      accountNumberLast4: "5678",
    });
    expect(JSON.stringify(payout)).not.toMatch(/12345678|123456|Jo Bloggs/);
    expect(
      decryptBankDetails(payout as Parameters<typeof decryptBankDetails>[0], cipher).accountNumber,
    ).toBe("12345678");
  });

  it("reuses an existing customer by email, case-insensitively", async () => {
    const email = `same.${randomBytes(3).toString("hex")}@example.co.uk`;
    const a = await create(input({ email }));
    const b = await create(input({ email: email.toUpperCase() }));
    if (!a.ok || !b.ok) throw new Error("expected ok");
    const rows = await db.select().from(customers).where(eq(customers.email, email));
    expect(rows).toHaveLength(1);
  });

  it("asks again if the price changed since it was shown", async () => {
    const result = await create(input({ expectedOfferPence: 99_999 }));
    expect(result).toEqual({
      ok: false,
      reason: "price_changed",
      offerPence: sampleTradeInPence(26000, 0, "A"),
    });
  });

  it("refuses an IMEI that already has an open quote", async () => {
    const imei = freshImei();
    expect((await create(input({ imei }))).ok).toBe(true);
    expect(await create(input({ imei }))).toEqual({ ok: false, reason: "imei_in_use" });
  });

  it("rejects tampered answers", async () => {
    expect(await create(input({ answers: { ...perfect, screen: "brand_new" } }))).toEqual({
      ok: false,
      reason: "invalid_answers",
    });
  });

  it("won't accept faulty phones worth too little online", async () => {
    const [cheap] = await db
      .select({ id: modelVariants.id })
      .from(modelVariants)
      .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
      .where(eq(deviceModels.slug, "galaxy-a55"))
      .limit(1);
    const result = await create(
      input({
        variantId: cheap!.id,
        answers: {
          ...perfect,
          powers_on: "no",
          battery: "poor",
          biometrics: "broken",
          network: "locked",
        },
        expectedOfferPence: 0,
      }),
    );
    expect(result).toEqual({ ok: false, reason: "not_acceptable_online" });
  });

  it("checks the drop-off store exists", async () => {
    const [store] = await db.select().from(stores).limit(1);
    expect(
      (await create(input({ delivery: { method: "store_drop_off", storeId: store!.id } }))).ok,
    ).toBe(true);
    expect(
      await create(input({ delivery: { method: "store_drop_off", storeId: crypto.randomUUID() } })),
    ).toEqual({ ok: false, reason: "unknown_store" });
  });

  it("audits quote creation without personal or bank data", async () => {
    const result = await create(input());
    if (!result.ok) throw new Error("expected ok");
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entityId, result.quoteId));
    expect(entry!.action).toBe("quote.create");
    expect(JSON.stringify(entry!.changes)).not.toMatch(/12345678|Bloggs|imei|07700/i);
  });

  it("finds the quote by tracking token, and only by the exact token", async () => {
    const result = await create(input());
    if (!result.ok) throw new Error("expected ok");
    const tracked = await getQuoteByTrackingToken(db, result.trackingToken);
    expect(tracked).toMatchObject({
      reference: result.reference,
      model: "iPhone 15",
      brand: "Apple",
    });
    const last = result.trackingToken.at(-1) === "x" ? "y" : "x";
    expect(await getQuoteByTrackingToken(db, result.trackingToken.slice(0, -1) + last)).toBeNull();
    expect(await getQuoteByTrackingToken(db, "'; drop table quotes; --")).toBeNull();
  });
});

describe("createQuoteSchema validation", () => {
  it.each<[string, Partial<CreateQuoteInput>, RegExp]>([
    ["bad IMEI checksum", { imei: "490154203237517" }, /IMEI isn’t valid/],
    [
      "short sort code",
      { bank: { accountHolderName: "J", sortCode: "12345", accountNumber: "12345678" } },
      /sort code/,
    ],
    [
      "7-digit account",
      { bank: { accountHolderName: "J", sortCode: "123456", accountNumber: "1234567" } },
      /account number/,
    ],
    ["non-UK phone", { phone: "+1 202 555 0100" }, /UK phone/],
    ["bad postcode", { address: { line1: "1 St", town: "Town", postcode: "NOPE" } }, /postcode/],
    [
      "ownership not declared",
      { declarations: { owner: false as true, activationLockOff: true } },
      /own this phone/,
    ],
    [
      "lock not declared",
      { declarations: { owner: true, activationLockOff: false as true } },
      /Find My/,
    ],
  ])("rejects %s", (_, override, message) => {
    const result = createQuoteSchema.safeParse(input(override));
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(message);
  });
});

describe("rate limiting", () => {
  it("allows up to the limit in a window, then blocks until it resets", async () => {
    const key = `test:${randomBytes(4).toString("hex")}`;
    const t0 = new Date("2026-11-17T12:00:00Z");
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await consumeRateLimit(db, { key, limit: 3, windowSeconds: 60, now: t0 }));
    }
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3]).toMatchObject({ remaining: 0, retryAfterSeconds: 60 });

    const later = await consumeRateLimit(db, {
      key,
      limit: 3,
      windowSeconds: 60,
      now: new Date(t0.getTime() + 61_000),
    });
    expect(later).toMatchObject({ allowed: true, remaining: 2 });
  });

  it("hashes identifiers so IPs and emails aren't stored", () => {
    const key = rateLimitKey("sell:quote:ip", "203.0.113.5", "secret");
    expect(key).toMatch(/^sell:quote:ip:[\w-]{32}$/);
    expect(key).not.toContain("203.0.113.5");
    expect(rateLimitKey("x", "A@B.com", "s")).toBe(rateLimitKey("x", "a@b.com", "s"));
  });
});
