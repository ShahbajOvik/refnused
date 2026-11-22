// @vitest-environment node
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  auditLog,
  customers,
  inspections,
  orderItems,
  orderRequests,
  orders,
  payouts,
  products,
  quotes,
  staffUsers,
  stores,
} from "@refnused/database/db/schema";
import { seed } from "@refnused/database/db/seed";
import { DEMO, seedDemoAccounts } from "@refnused/database/db/seed/demo";
import type { AppDb } from "@refnused/database/db/types";
import { ActionError } from "@refnused/database/lib/action-error";
import { parseCsv } from "@/lib/csv";
import type { PaymentGateway } from "@refnused/database/lib/payments/gateway";
import { createTestDb, testCipher } from "@refnused/database/test/db";
import { withImeiCheckDigit } from "@refnused/database/lib/validation/uk";

import { getDashboard } from "./dashboard";
import { createProductFromIntake, intakeSchema, lookupImei, updateProductAdmin } from "./intake";
import { advanceFulfilment, decideRequest, refundSchema, requestRefund } from "./orders";
import { exportPayoutBatch, listPayouts, markPayoutFailed, markPayoutsPaid } from "./payouts";
import { searchCustomers, storeUpdateSchema, updateStore } from "./people";
import {
  getPriceTable,
  parsePriceCsv,
  previewPriceImport,
  priceHistory,
  pricesToCsv,
  updatePrices,
} from "./prices";
import { inspectionSchema, markQuoteReceived, recordInspection } from "@refnused/database/lib/admin/quotes";

let db: AppDb;
let close: () => Promise<void>;
const cipher = testCipher();
let staffId: string;
let alex: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seed(db);
  await seedDemoAccounts(db, cipher);
  const [staff] = await db
    .insert(staffUsers)
    .values({ email: "manager@example.co.uk", name: "Morgan Manager", role: "manager" })
    .returning({ id: staffUsers.id });
  staffId = staff!.id;
  alex = (
    await db.select({ id: customers.id }).from(customers).where(eq(customers.email, DEMO.quotes))
  )[0]!.id;
});
afterAll(() => close?.());

const audits = (action: string) => db.select().from(auditLog).where(eq(auditLog.action, action));

async function alexQuote(status: string) {
  const [q] = await db
    .select({
      id: quotes.id,
      reference: quotes.reference,
      offeredPricePence: quotes.offeredPricePence,
      imei: quotes.imei,
    })
    .from(quotes)
    .where(and(eq(quotes.customerId, alex), eq(quotes.status, status as never)));
  return q!;
}

describe("dashboard", () => {
  it("counts today's work, stock per store and revenue", async () => {
    const dashboard = await getDashboard(db, { includeRevenue: true });
    expect(dashboard.quotes.awaitingCustomer).toBe(2);
    expect(dashboard.orders.readyToCollect).toBe(1);
    expect(dashboard.stock.map((s) => s.storeTown)).toEqual([
      "North Shields",
      "South Shields",
      "North Shields",
    ]);
    expect(dashboard.stock.reduce((sum, s) => sum + s.listed, 0)).toBe(26);
    // Demo orders: today (£469), 3 days ago (£459) and 1 day ago (£449); 60 days ago excluded.
    expect(dashboard.revenue!.todayPence).toBe(46900);
    expect(dashboard.revenue!.last7DaysPence).toBe(46900 + 45900 + 44900);
    expect((await getDashboard(db, { includeRevenue: false })).revenue).toBeNull();
  });
});

describe("prices", () => {
  it("updates changed prices only and records the history", async () => {
    const [row] = await getPriceTable(db, "pixel-8a");
    const before = row!.prices.A!;
    const changed = await updatePrices(
      db,
      [
        { variantId: row!.variantId, grade: "A", pricePence: before + 500 },
        { variantId: row!.variantId, grade: "B", pricePence: row!.prices.B! },
      ],
      { staffId, source: "table" },
    );
    expect(changed).toBe(1);
    const history = await priceHistory(db, { variantId: row!.variantId });
    expect(history[0]).toMatchObject({
      staffName: "Morgan Manager",
      beforePence: before,
      afterPence: before + 500,
      label: expect.stringMatching(/^Google Pixel 8a, 128GB, \w+ · Grade A$/),
    });
  });

  it("exports and re-imports CSV, previewing changes first", async () => {
    const rows = await getPriceTable(db, "pixel-9");
    const csv = pricesToCsv(rows);
    const lines = parseCsv(csv);
    expect(lines[0]).toEqual([
      "variant_id",
      "brand",
      "model",
      "storage_gb",
      "colour",
      "grade_a",
      "grade_b",
      "grade_c",
      "faulty",
    ]);
    // Raise one price; keep the rest.
    lines[1]![5] = (Number(lines[1]![5]) + 10).toFixed(2);
    const edited = lines.map((l) => l.join(",")).join("\n");
    const preview = await previewPriceImport(db, edited);
    expect(preview.errors).toEqual([]);
    expect(preview.changes).toHaveLength(1);
    expect(preview.changes[0]!.pricePence - preview.changes[0]!.beforePence!).toBe(1000);
    expect(preview.unchanged).toBeGreaterThan(0);
  });

  it("reports bad rows with line numbers", () => {
    const result = parsePriceCsv(
      `variant_id,grade_a,faulty\nnot-a-uuid,10\n11111111-1111-4111-8111-111111111111,abc,\n11111111-1111-4111-8111-111111111111,"£1,250.50",`,
    );
    expect(result.errors).toEqual([
      { line: 2, message: "variant_id isn’t valid." },
      { line: 3, message: "grade_a must be a price in pounds, like 120.00." },
    ]);
    expect(result.changes).toEqual([
      { variantId: "11111111-1111-4111-8111-111111111111", grade: "A", pricePence: 125050 },
    ]);
    expect(parsePriceCsv("brand,model\nApple,iPhone").errors[0]!.message).toMatch(/variant_id/);
  });
});

describe("quotes and inspections", () => {
  it("marks a phone received, then approves it on a clean inspection", async () => {
    const quote = await alexQuote("accepted");
    await markQuoteReceived(db, { quoteId: quote.id, staffId });
    await expect(markQuoteReceived(db, { quoteId: quote.id, staffId })).rejects.toThrow(
      ActionError,
    );

    const result = await recordInspection(db, {
      ...inspectionSchema.parse({
        quoteId: quote.id,
        actualGrade: "A",
        checkmendResult: "clear",
        checkmendReference: "CM123",
        revisedPounds: String(quote.offeredPricePence / 100),
        photos: [{ key: "inspections/q/1.webp", alt: "Front" }],
      }),
      staffId,
    });
    expect(result.outcome).toBe("approved");
    const [row] = await db.select().from(quotes).where(eq(quotes.id, quote.id));
    expect(row!.status).toBe("approved");
    const [inspection] = await db
      .select()
      .from(inspections)
      .where(eq(inspections.quoteId, quote.id));
    expect(inspection).toMatchObject({
      revisedOfferStatus: "not_required",
      checkmendReference: "CM123",
    });
    expect(inspection!.photos).toHaveLength(1);
    await expect(
      recordInspection(db, {
        ...inspectionSchema.parse({
          quoteId: quote.id,
          actualGrade: "A",
          checkmendResult: "clear",
        }),
        staffId,
      }),
    ).rejects.toThrow("already been decided");
  });

  it("won't put a revised offer on a phone that failed CheckMEND", () => {
    expect(() =>
      inspectionSchema.parse({
        quoteId: crypto.randomUUID(),
        actualGrade: "A",
        checkmendResult: "lost_or_stolen",
        revisedPounds: "100",
      }),
    ).toThrow(/failed CheckMEND/);
  });

  it("revises the offer when the price changes, or waits on a CheckMEND error", async () => {
    // Make the paid demo quote's twin: reuse the approved one by resetting it.
    const approved = await alexQuote("approved");
    await db.update(quotes).set({ status: "received" }).where(eq(quotes.id, approved.id));
    const pending = await recordInspection(db, {
      ...inspectionSchema.parse({
        quoteId: approved.id,
        actualGrade: "B",
        checkmendResult: "error",
      }),
      staffId,
    });
    expect(pending.outcome).toBe("pending_check");
    expect((await db.select().from(quotes).where(eq(quotes.id, approved.id)))[0]!.status).toBe(
      "inspecting",
    );

    const revised = await recordInspection(db, {
      ...inspectionSchema.parse({
        quoteId: approved.id,
        actualGrade: "C",
        checkmendResult: "clear",
        revisedPounds: "150",
      }),
      staffId,
    });
    expect(revised.outcome).toBe("revised");
    const latest = await db.select().from(inspections).where(eq(inspections.quoteId, approved.id));
    expect(latest.find((i) => i.revisedPricePence === 15000)?.revisedOfferStatus).toBe("pending");

    // Reject on a stolen phone.
    await db.update(quotes).set({ status: "received" }).where(eq(quotes.id, approved.id));
    const rejected = await recordInspection(db, {
      ...inspectionSchema.parse({
        quoteId: approved.id,
        actualGrade: "A",
        checkmendResult: "lost_or_stolen",
      }),
      staffId,
    });
    expect(rejected.outcome).toBe("rejected");
    const [payout] = await db.select().from(payouts).where(eq(payouts.quoteId, approved.id));
    expect(payout!.status).toBe("cancelled");
    expect((await audits("quote.inspected")).length).toBeGreaterThanOrEqual(4);
  });
});

describe("payouts", () => {
  it("exports ready payouts for the bank, then marks them paid", async () => {
    // One revised demo quote: the customer accepts → approved and ready.
    const revised = await alexQuote("revised");
    await db.update(quotes).set({ status: "approved" }).where(eq(quotes.id, revised.id));

    const ready = await listPayouts(db, "ready");
    expect(ready.map((p) => p.quoteId)).toContain(revised.id);

    const batch = await exportPayoutBatch(db, { staffId }, { cipher });
    expect(batch).not.toBeNull();
    const rows = parseCsv(batch!.csv);
    expect(rows[0]).toEqual(["payee_name", "sort_code", "account_number", "amount", "reference"]);
    expect(rows[1]).toEqual([
      "Alex Demo",
      "11-22-33",
      "11223344",
      expect.stringMatching(/^\d+\.\d\d$/),
      expect.stringMatching(/^RUQ[0-9A-Z]{6}$/),
    ]);
    // Nothing left to export.
    expect(await exportPayoutBatch(db, { staffId }, { cipher })).toBeNull();
    const exportAudit = (await audits("payout.exported"))[0]!;
    expect(JSON.stringify(exportAudit)).not.toContain("11223344");

    const processing = await listPayouts(db, "processing");
    const ids = processing.map((p) => p.id);
    await markPayoutFailed(db, { staffId, payoutId: ids[0]!, reason: "Account closed" });
    expect((await listPayouts(db, "ready")).map((p) => p.id)).toContain(ids[0]);

    const paid = await markPayoutsPaid(db, {
      staffId,
      payoutIds: ids.slice(1).length ? ids.slice(1) : [ids[0]!],
    });
    expect(paid.length).toBeGreaterThan(0);
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, paid[0]!.quoteId));
    expect(quote!.status).toBe("paid");
    await expect(
      markPayoutsPaid(db, { staffId, payoutIds: [paid.length ? ids.at(-1)! : ids[0]!] }),
    ).rejects.toThrow(ActionError);
  });
});

describe("device intake", () => {
  const store = async () => (await db.select({ id: stores.id }).from(stores).limit(1))[0]!.id;
  const variant = async () => (await getPriceTable(db, "iphone-13"))[0]!.variantId;

  it("creates a draft, refuses to publish without a certificate, and publishes with one", async () => {
    const imei = withImeiCheckDigit("35888888000001");
    expect(await lookupImei(db, imei)).toEqual({ product: null, quote: null });
    const base = {
      imei,
      variantId: await variant(),
      grade: "B",
      batteryHealthPercent: "88",
      pricePounds: "249",
      storeId: await store(),
      photos: [{ key: "products/x/front.webp", alt: "Front" }],
    };
    await expect(
      createProductFromIntake(db, { ...intakeSchema.parse({ ...base, publish: true }), staffId }),
    ).rejects.toThrow("data-wipe certificate");

    const draft = await createProductFromIntake(db, { ...intakeSchema.parse(base), staffId });
    expect(draft.status).toBe("draft");
    expect((await lookupImei(db, imei)).product?.status).toBe("draft");
    await expect(
      createProductFromIntake(db, { ...intakeSchema.parse(base), staffId }),
    ).rejects.toThrow("already exists");

    await expect(
      updateProductAdmin(db, { productId: draft.id, status: "listed", staffId }),
    ).rejects.toThrow("data-wipe certificate");

    const listed = await createProductFromIntake(db, {
      ...intakeSchema.parse({
        ...base,
        imei: withImeiCheckDigit("35888888000002"),
        certificateKey: "certificates/abc.pdf",
        publish: true,
      }),
      staffId,
    });
    expect(listed.status).toBe("listed");
    const [row] = await db.select().from(products).where(eq(products.id, listed.id));
    expect(row).toMatchObject({ pricePence: 24900, grade: "B", batteryHealthPercent: 88 });
    expect(row!.listedAt).toBeInstanceOf(Date);

    await updateProductAdmin(db, { productId: listed.id, pricePounds: 239, staffId });
    const priceAudit = (await audits("product.price_changed")).find(
      (a) => a.entityId === listed.id,
    );
    expect(priceAudit?.changes).toEqual({
      before: { pricePence: 24900 },
      after: { pricePence: 23900 },
    });
  });

  it("finds the trade-in an IMEI came from", async () => {
    const paid = await db
      .select({ imei: quotes.imei, reference: quotes.reference })
      .from(quotes)
      .where(and(eq(quotes.customerId, alex), eq(quotes.status, "paid")));
    const lookup = await lookupImei(db, paid[0]!.imei!);
    expect(lookup.quote?.reference).toBe(paid[0]!.reference);
  });
});

describe("orders, refunds and requests", () => {
  const order = async (number: string) =>
    (await db.select().from(orders).where(eq(orders.orderNumber, number)))[0]!;

  it("only allows the next fulfilment step", async () => {
    const collect = await order("RU-900002"); // ready for collection
    await expect(
      advanceFulfilment(db, {
        orderId: collect.id,
        step: "dispatched",
        carrier: "DPD",
        trackingNumber: "1234",
        staffId,
      }),
    ).rejects.toThrow(ActionError);
    expect(
      await advanceFulfilment(db, { orderId: collect.id, step: "completed", staffId }),
    ).toEqual({ notify: null });
    const done = await order("RU-900002");
    expect(done.status).toBe("completed");
    expect(done.fulfilledAt).toBeInstanceOf(Date);
  });

  it("refunds through the payment gateway, no more than was paid", async () => {
    const calls: [string, number | undefined][] = [];
    const gateway = {
      refund: async (id: string, _key: string, amount?: number) => void calls.push([id, amount]),
    } as unknown as PaymentGateway;
    const paid = await order("RU-900001");
    await expect(
      requestRefund(db, gateway, {
        ...refundSchema.parse({ orderId: paid.id, amountPounds: "1000", reason: "Too much" }),
        staffId,
      }),
    ).rejects.toThrow("up to £459.00");
    expect(
      await requestRefund(db, gateway, {
        ...refundSchema.parse({ orderId: paid.id, amountPounds: "50", reason: "Scuff" }),
        staffId,
      }),
    ).toEqual({
      amountPence: 5000,
    });
    expect(calls).toEqual([["pi_demo_RU900001", 5000]]);
  });

  it("approves then completes a return, putting the unit back as returned", async () => {
    const o = await order("RU-900001");
    const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
    const [request] = await db
      .insert(orderRequests)
      .values({
        reference: "RU-R-TEST01",
        orderId: o.id,
        orderItemId: item!.id,
        type: "return",
        reason: "changed_mind",
        description: "Changed my mind about it.",
      })
      .returning();
    await expect(
      decideRequest(db, { requestId: request!.id, decision: "completed", note: null, staffId }),
    ).rejects.toThrow(ActionError);
    await decideRequest(db, {
      requestId: request!.id,
      decision: "approved",
      note: "Label sent",
      staffId,
    });
    await decideRequest(db, {
      requestId: request!.id,
      decision: "completed",
      note: "Received OK",
      staffId,
    });
    const [row] = await db.select().from(orderRequests).where(eq(orderRequests.id, request!.id));
    expect(row).toMatchObject({
      status: "completed",
      staffNotes: "Label sent\nReceived OK",
      resolvedById: staffId,
    });
    const [unit] = await db.select().from(products).where(eq(products.id, item!.productId));
    expect(unit!.status).toBe("returned");
  });
});

describe("customers and stores", () => {
  it("finds customers by email, name, phone or reference", async () => {
    expect((await searchCustomers(db, "alex")).map((c) => c.email)).toContain(DEMO.quotes);
    expect((await searchCustomers(db, "07700 900111")).length).toBeGreaterThan(0);
    expect((await searchCustomers(db, "RU-900001")).map((c) => c.email)).toEqual([DEMO.quotes]);
    expect(await searchCustomers(db, "a")).toEqual([]);
  });

  it("updates a store's details and opening hours, and audits the change", async () => {
    const [store] = await db
      .select()
      .from(stores)
      .where(eq(stores.slug, "metrotech-north-shields"));
    const day = { closed: false, opens: "09:00", closes: "17:30" };
    const input = storeUpdateSchema.parse({
      storeId: store!.id,
      name: store!.name,
      street: store!.street,
      town: store!.town,
      postcode: store!.postcode,
      phone: "0191 380 0456",
      email: "",
      latitude: "55.0077",
      longitude: "-1.4472",
      isActive: true,
      parkingInfo: "  Car park behind the store, 2 hours free.  ",
      nearestMetro: store!.nearestMetro ?? "",
      photos: [{ key: "stores/2026-11/front.webp", alt: "Shop front" }],
      hours: {
        mon: day,
        tue: day,
        wed: day,
        thu: day,
        fri: day,
        sat: { closed: false, opens: "10:00", closes: "17:00" },
        sun: { closed: true },
      },
    });
    await updateStore(db, { ...input, staffId });
    const [after] = await db.select().from(stores).where(eq(stores.id, store!.id));
    expect(after!.openingHours).toMatchObject({
      mon: { opens: "09:00", closes: "17:30" },
      sun: null,
    });
    expect(after!.latitude).toBeCloseTo(55.0077);
    expect(after!.parkingInfo).toBe("Car park behind the store, 2 hours free.");
    expect(after!.photos).toEqual([{ key: "stores/2026-11/front.webp", alt: "Shop front" }]);
    const audit = (await audits("store.updated")).at(-1)!;
    expect(Object.keys((audit.changes as { after: object }).after).sort()).toEqual([
      "latitude",
      "longitude",
      "openingHours",
      "parkingInfo",
      "photos",
    ]);

    // Photos must be store uploads, with a description.
    expect(
      storeUpdateSchema.safeParse({
        ...input,
        photos: [{ key: "certificates/2026-11/x.pdf", alt: "x" }],
      }).success,
    ).toBe(false);
    expect(
      storeUpdateSchema.safeParse({ ...input, photos: [{ key: "stores/a.webp", alt: " " }] })
        .success,
    ).toBe(false);

    expect(
      storeUpdateSchema.safeParse({
        ...input,
        hours: { ...input.hours, mon: { closed: false, opens: "18:00", closes: "09:00" } },
      }).success,
    ).toBe(false);
  });
});
