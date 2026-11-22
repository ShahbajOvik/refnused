// @vitest-environment node
/**
 * Applies the real migrations to a MySQL 8 database, runs the seed and
 * checks the constraints that protect money and stock.
 */
import { randomBytes } from "node:crypto";

import { count, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { stores as storeConfig } from "../config/site";
import { createTestDb } from "../test/db";
import { dbError } from "./results";
import * as schema from "./schema";
import type { AppDb } from "./types";
import { seed } from "./seed";
import { sampleTradeInPence, seedModels, seedProducts } from "./seed/catalogue";
import { decryptBankDetails, encryptBankDetails } from "../lib/crypto/bank-details";
import { createFieldCipher, parseKeyring } from "../lib/crypto/field-encryption";

let db: AppDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});

afterAll(async () => {
  await close?.();
});

/** MySQL error code/constraint from a failed query. */
async function queryError(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return dbError(error);
  }
  throw new Error("Expected the query to fail");
}

const expectedVariants = seedModels.reduce((n, m) => n + m.storageGb.length * m.colours.length, 0);

describe("seed", () => {
  it("creates stores, brands, 10 models, variants and prices", async () => {
    const result = await seed(db);
    expect(result).toEqual({
      stores: storeConfig.length,
      brands: 3,
      models: 10,
      variants: expectedVariants,
      tradeInPricesInserted: expectedVariants * 4,
      productsInserted: seedProducts.length,
      quoteQuestionsInserted: 6,
    });
  });

  it("is idempotent and keeps staff-edited prices", async () => {
    const [price] = await db.select().from(schema.tradeInPrices).limit(1);
    await db
      .update(schema.tradeInPrices)
      .set({ pricePence: 12345 })
      .where(eq(schema.tradeInPrices.id, price!.id));

    const again = await seed(db);
    expect(again.tradeInPricesInserted).toBe(0);
    expect(again.productsInserted).toBe(0);
    expect(again.quoteQuestionsInserted).toBe(0);

    const [{ value: models }] = await db.select({ value: count() }).from(schema.deviceModels);
    expect(models).toBe(10);
    const [{ value: prices }] = await db.select({ value: count() }).from(schema.tradeInPrices);
    expect(prices).toBe(expectedVariants * 4);

    const [kept] = await db
      .select({ pricePence: schema.tradeInPrices.pricePence })
      .from(schema.tradeInPrices)
      .where(eq(schema.tradeInPrices.id, price!.id));
    expect(kept!.pricePence).toBe(12345);
  });

  it("prices fall as condition worsens", async () => {
    const model = await db.query.deviceModels.findFirst({
      where: eq(schema.deviceModels.slug, "iphone-15"),
      with: { variants: { with: { tradeInPrices: true } } },
    });
    const variant = model!.variants.find((v) => v.storageGb === 128)!;
    const byGrade = Object.fromEntries(variant.tradeInPrices.map((p) => [p.grade, p.pricePence]));
    expect(byGrade.A).toBe(sampleTradeInPence(26000, 0, "A"));
    expect(byGrade.A).toBeGreaterThan(byGrade.B!);
    expect(byGrade.B).toBeGreaterThan(byGrade.C!);
    expect(byGrade.C).toBeGreaterThan(byGrade.faulty!);
  });
});

describe("constraints", () => {
  async function fixtures() {
    const [store] = await db.select().from(schema.stores).limit(1);
    const [variant] = await db.select().from(schema.modelVariants).limit(1);
    const [{ id }] = await db
      .insert(schema.customers)
      .values({ email: `test-${randomBytes(4).toString("hex")}@example.com` })
      .$returningId();
    const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, id!));
    return { store: store!, variant: variant!, customer: customer! };
  }

  it("rejects duplicate customer emails regardless of case", async () => {
    await db.insert(schema.customers).values({ email: "Jane@Example.com" });
    const error = await queryError(
      db.insert(schema.customers).values({ email: "jane@example.com" }),
    );
    expect(error.code).toBe("ER_DUP_ENTRY");
  });

  it("will not list a product without a data-wipe certificate", async () => {
    const { store, variant } = await fixtures();
    const base = {
      slug: "iphone-15-128gb-black-test01",
      variantId: variant.id,
      grade: "A" as const,
      batteryHealthPercent: 91,
      pricePence: 45900,
      storeId: store.id,
    };
    const error = await queryError(
      db.insert(schema.products).values({ ...base, imei: "356938035643809", status: "listed" }),
    );
    expect(error.constraint).toBe("products_wipe_certificate_check");

    await db.insert(schema.products).values({
      ...base,
      imei: "356938035643809",
      status: "listed",
      dataWipeCertificateKey: "certificates/356938035643809.pdf",
    });
  });

  it("rejects invalid IMEIs and battery health", async () => {
    const { store, variant } = await fixtures();
    const base = {
      slug: "iphone-15-128gb-black-test02",
      variantId: variant.id,
      grade: "B" as const,
      pricePence: 30000,
      storeId: store.id,
    };
    expect(
      (
        await queryError(
          db.insert(schema.products).values({ ...base, imei: "12345", batteryHealthPercent: 90 }),
        )
      ).constraint,
    ).toBe("products_imei_check");
    expect(
      (
        await queryError(
          db
            .insert(schema.products)
            .values({ ...base, imei: "490154203237518", batteryHealthPercent: 101 }),
        )
      ).constraint,
    ).toBe("products_battery_check");
  });

  it("rejects product slugs that aren't URL-safe", async () => {
    const { store, variant } = await fixtures();
    const error = await queryError(
      db.insert(schema.products).values({
        slug: "iPhone 15/../x",
        variantId: variant.id,
        grade: "B",
        batteryHealthPercent: 90,
        pricePence: 30000,
        storeId: store.id,
        imei: "490154203237518",
      }),
    );
    expect(error.constraint).toBe("products_slug_check");
  });

  it("requires order totals to add up", async () => {
    const { store } = await fixtures();
    const error = await queryError(
      db.insert(schema.orders).values({
        orderNumber: "RU-TEST-1",
        email: "buyer@example.com",
        fulfilmentMethod: "click_and_collect",
        collectionStoreId: store.id,
        subtotalPence: 50000,
        deliveryPence: 0,
        discountPence: 0,
        totalPence: 1,
      }),
    );
    expect(error.constraint).toBe("orders_total_check");
  });

  it("requires a customer and delivery method once a quote is accepted", async () => {
    const { variant } = await fixtures();
    const error = await queryError(
      db.insert(schema.quotes).values({
        reference: "RU-Q-TEST1",
        variantId: variant.id,
        quotedGrade: "A",
        answers: { version: 1, responses: { powersOn: true } },
        offeredPricePence: 20000,
        priceLockedUntil: new Date(Date.now() + 14 * 86_400_000),
        status: "accepted",
      }),
    );
    expect(error.constraint).toBe("quotes_accepted_check");
  });

  it("requires bank details for bank-transfer payouts and stores them encrypted", async () => {
    const { variant, customer } = await fixtures();
    const [quote] = await db
      .insert(schema.quotes)
      .values({
        reference: "RU-Q-TEST2",
        customerId: customer.id,
        variantId: variant.id,
        quotedGrade: "B",
        answers: { version: 1, responses: { powersOn: true } },
        offeredPricePence: 18000,
        priceLockedUntil: new Date(Date.now() + 14 * 86_400_000),
        status: "approved",
        deliveryMethod: "postage_pack",
        contactEmail: customer.email,
        ownershipDeclaredAt: new Date(),
        activationLockOffDeclaredAt: new Date(),
      })
      .$returningId();

    const payout = {
      quoteId: quote!.id,
      customerId: customer.id,
      amountPence: 18000,
      method: "bank_transfer" as const,
    };
    expect((await queryError(db.insert(schema.payouts).values(payout))).constraint).toBe(
      "payouts_bank_details_check",
    );

    const cipher = createFieldCipher(parseKeyring(`k1:${randomBytes(32).toString("base64")}`));
    const encrypted = encryptBankDetails(
      { accountHolderName: "Jane Smith", sortCode: "12-34-56", accountNumber: "12345678" },
      cipher,
    );
    const [{ id: payoutId }] = await db
      .insert(schema.payouts)
      .values({ ...payout, ...encrypted })
      .$returningId();
    const [saved] = await db.select().from(schema.payouts).where(eq(schema.payouts.id, payoutId!));

    // Nothing sensitive is stored in clear.
    const [rows] = (await db.execute(
      sql`select * from payouts where id = ${payoutId}`,
    )) as unknown as [Record<string, unknown>[]];
    expect(JSON.stringify(rows[0])).not.toMatch(/Jane Smith|123456|12345678/);
    expect(rows[0]!.account_number_last4).toBe("5678");

    expect(decryptBankDetails(saved as typeof encrypted, cipher).accountNumber).toBe("12345678");
  });
});
