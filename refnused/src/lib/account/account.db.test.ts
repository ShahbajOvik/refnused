// @vitest-environment node
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  auditLog,
  customerAddresses,
  customerPayoutAccounts,
  customers,
  inspections,
  orders,
  payouts,
  priceAlerts,
  pushSubscriptions,
  quotes,
} from "@refnused/database/db/schema";
import { seed } from "@refnused/database/db/seed";
import { DEMO, seedDemoAccounts } from "@refnused/database/db/seed/demo";
import type { AppDb } from "@refnused/database/db/types";
import { decryptBankDetails } from "@refnused/database/lib/crypto/bank-details";
import {
  createOrderRequest,
  listCustomerOrders,
  orderRequestSchema,
} from "@refnused/database/lib/orders/order-service";
import { savePushTopic } from "@refnused/database/lib/push/service";
import { createTestDb, testCipher } from "@refnused/database/test/db";

import {
  deleteAddress,
  listAddresses,
  MAX_ADDRESSES,
  saveAddress,
  addressInputSchema,
} from "./addresses";
import {
  createPriceAlert,
  deletePriceAlert,
  listPriceAlerts,
  priceAlertSchema,
  setPriceAlertActive,
} from "./alerts";
import { changePayoutDetails, getPayoutSummary } from "./payout";
import {
  deleteCustomerAccount,
  deletionBlockers,
  exportCustomerData,
  redactedEmail,
  setMarketingPreferences,
} from "./privacy";
import {
  listCustomerQuotes,
  quoteTimeline,
  respondToRevisedOffer,
} from "@refnused/database/lib/account/quotes";
import { issueVerificationCode, MAX_CODE_ATTEMPTS, verifyCode } from "./verification";

let db: AppDb;
let close: () => Promise<void>;
const cipher = testCipher();
let alex: string;
let dee: string;

async function customerId(email: string) {
  const [row] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.email, email));
  return row!.id;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seed(db);
  await seedDemoAccounts(db, cipher);
  alex = await customerId(DEMO.quotes);
  dee = await customerId(DEMO.deletable);
});
afterAll(() => close?.());

describe("quotes and the revised-offer decision", () => {
  it("lists the customer's trade-ins with a timeline", async () => {
    const list = await listCustomerQuotes(db, alex);
    expect(list.map((q) => q.status).sort()).toEqual(["accepted", "paid", "revised", "revised"]);

    const waiting = list.find((q) => q.status === "accepted")!;
    expect(quoteTimeline(waiting).map((s) => [s.key, s.state])).toEqual([
      ["accepted", "done"],
      ["received", "current"],
      ["inspected", "upcoming"],
      ["paid", "upcoming"],
    ]);

    const revised = list.find((q) => q.inspection?.revisedPricePence === 16000)!;
    const steps = quoteTimeline(revised);
    expect(steps.find((s) => s.key === "revised")).toMatchObject({
      label: "Offer revised to £160.00",
      state: "current",
    });

    const paid = list.find((q) => q.status === "paid")!;
    expect(quoteTimeline(paid).at(-1)).toMatchObject({ key: "paid", state: "done" });
    expect(quoteTimeline(paid).at(-1)!.detail).toMatch(/to account ending 3344$/);
  });

  it("shows a failed end for rejected phones", () => {
    const base = {
      id: "q",
      reference: "RU-Q-AAAAAA",
      device: "Apple iPhone 15, 128GB",
      offeredPricePence: 26000,
      priceLockedUntil: new Date(),
      deliveryMethod: "postage_pack",
      dropOffStore: null,
      acceptedAt: new Date(),
      receivedAt: new Date(),
      createdAt: new Date(),
      payout: null,
      creditedToOrder: null,
    };
    const steps = quoteTimeline({
      ...base,
      status: "rejected",
      inspection: {
        inspectedAt: new Date(),
        actualGrade: "A",
        revisedPricePence: null,
        revisedOfferStatus: "not_required",
        checkmendResult: "lost_or_stolen",
        notes: null,
      },
    });
    expect(steps.at(-1)).toMatchObject({ key: "rejected", state: "failed" });
    expect(steps.map((s) => s.key)).not.toContain("paid");
  });

  it("accepting a revised offer approves it and changes the payout", async () => {
    const quote = (await listCustomerQuotes(db, alex)).find(
      (q) => q.inspection?.revisedPricePence === 16000,
    )!;
    // Another customer can't answer for Alex.
    expect(
      await respondToRevisedOffer(db, { customerId: dee, quoteId: quote.id, decision: "accept" }),
    ).toEqual({ ok: false, reason: "not_found" });

    expect(
      await respondToRevisedOffer(db, { customerId: alex, quoteId: quote.id, decision: "accept" }),
    ).toEqual({ ok: true, decision: "accept", payoutPence: 16000 });
    const [row] = await db.select().from(quotes).where(eq(quotes.id, quote.id));
    expect(row!.status).toBe("approved");
    const [payout] = await db.select().from(payouts).where(eq(payouts.quoteId, quote.id));
    expect(payout).toMatchObject({ amountPence: 16000, status: "pending" });
    // Only once.
    expect(
      await respondToRevisedOffer(db, { customerId: alex, quoteId: quote.id, decision: "return" }),
    ).toEqual({ ok: false, reason: "no_pending_offer" });
  });

  it("asking for the phone back cancels the payout", async () => {
    const quote = (await listCustomerQuotes(db, alex)).find(
      (q) => q.inspection?.revisedPricePence === 15000,
    )!;
    expect(
      await respondToRevisedOffer(db, { customerId: alex, quoteId: quote.id, decision: "return" }),
    ).toMatchObject({ ok: true, decision: "return" });
    const [inspection] = await db
      .select()
      .from(inspections)
      .where(eq(inspections.quoteId, quote.id));
    expect(inspection!.revisedOfferStatus).toBe("declined");
    const [payout] = await db.select().from(payouts).where(eq(payouts.quoteId, quote.id));
    expect(payout!.status).toBe("cancelled");
  });
});

describe("orders in the account", () => {
  it("lists orders with tracking links", async () => {
    const list = await listCustomerOrders(db, alex);
    expect(list.map((o) => o.orderNumber)).toEqual(["RU-900002", "RU-900001"]);
    const delivered = list.find((o) => o.orderNumber === "RU-900001")!;
    expect(delivered.tracking).toEqual({
      carrier: "Royal Mail",
      number: "AB123456789GB",
      url: "https://www.royalmail.com/track-your-item#/tracking-results/AB123456789GB",
    });
    expect(delivered.items[0]!.returnEligibility.allowed).toBe(true);
  });

  it("lets the owner, and only the owner, request a return", async () => {
    const [order] = await listCustomerOrders(db, alex);
    const input = orderRequestSchema.parse({
      type: "warranty",
      orderItemId: order!.items[0]!.id,
      reason: "screen",
      description: "Touch stops working at the top.",
    });
    expect(await createOrderRequest(db, { customerId: dee }, input)).toMatchObject({ ok: false });
    expect(await createOrderRequest(db, { customerId: alex }, input)).toMatchObject({ ok: true });
  });
});

describe("saved addresses", () => {
  const input = (overrides: Record<string, unknown> = {}) =>
    addressInputSchema.parse({
      name: "Alex Demo",
      line1: "5 Work Street",
      town: "Newcastle",
      postcode: "ne1 4st",
      ...overrides,
    });

  it("adds, keeps one default, and promotes another when the default goes", async () => {
    const before = await listAddresses(db, alex);
    const added = await saveAddress(db, alex, input({ label: "Work", isDefault: true }));
    if (!added.ok) throw new Error(added.reason);
    let list = await listAddresses(db, alex);
    expect(list.filter((a) => a.isDefault).map((a) => a.id)).toEqual([added.id]);
    expect(list[0]!.postcode).toBe("NE1 4ST");

    expect(await deleteAddress(db, dee, added.id)).toBe(false);
    expect(await deleteAddress(db, alex, added.id)).toBe(true);
    list = await listAddresses(db, alex);
    expect(list).toHaveLength(before.length);
    expect(list.filter((a) => a.isDefault)).toHaveLength(1);
  });

  it("can't edit someone else's address and has a limit", async () => {
    const [deeAddress] = await listAddresses(db, dee);
    expect(await saveAddress(db, alex, input(), deeAddress!.id)).toEqual({
      ok: false,
      reason: "not_found",
    });
    const count = (await listAddresses(db, alex)).length;
    for (let i = count; i < MAX_ADDRESSES; i++) await saveAddress(db, alex, input());
    expect(await saveAddress(db, alex, input())).toEqual({ ok: false, reason: "limit" });
    await db
      .delete(customerAddresses)
      .where(and(eq(customerAddresses.customerId, alex), eq(customerAddresses.isDefault, false)));
  });
});

describe("verification codes", () => {
  it("accepts the latest code once, within its time", async () => {
    const now = new Date();
    const { code } = await issueVerificationCode(db, alex, "payout_change", now);
    expect(await verifyCode(db, alex, "delete_account", code, now)).toBe("invalid");
    expect(await verifyCode(db, alex, "payout_change", code, now)).toBe("ok");
    expect(await verifyCode(db, alex, "payout_change", code, now)).toBe("invalid");

    const second = await issueVerificationCode(db, alex, "payout_change", now);
    expect(
      await verifyCode(
        db,
        alex,
        "payout_change",
        second.code,
        new Date(now.getTime() + 11 * 60_000),
      ),
    ).toBe("expired");
  });

  it("locks after too many wrong guesses", async () => {
    const { code } = await issueVerificationCode(db, alex, "payout_change");
    const wrong = code === "000000" ? "111111" : "000000";
    let result = "";
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
      result = await verifyCode(db, alex, "payout_change", wrong);
    }
    expect(result).toBe("too_many_attempts");
    expect(await verifyCode(db, alex, "payout_change", code)).toBe("too_many_attempts");
  });
});

describe("payout details", () => {
  const details = {
    accountHolderName: "Alex Demo",
    sortCode: "20-00-99",
    accountNumber: "55556789",
  };

  it("needs a valid code, stores only masked values in clear, and updates pending payouts", async () => {
    expect(
      await changePayoutDetails(
        db,
        { customerId: alex, code: "123456", details, applyToPending: true },
        { cipher },
      ),
    ).toMatchObject({ ok: false });

    const { code } = await issueVerificationCode(db, alex, "payout_change");
    const result = await changePayoutDetails(
      db,
      { customerId: alex, code, details, applyToPending: true },
      { cipher },
    );
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.appliedToPayouts).toBeGreaterThan(0);

    const summary = await getPayoutSummary(db, alex);
    expect(summary.account).toMatchObject({ sortCodeLast2: "99", accountNumberLast4: "6789" });

    const [pending] = await db
      .select()
      .from(payouts)
      .where(and(eq(payouts.customerId, alex), eq(payouts.status, "pending")));
    expect(
      decryptBankDetails(
        {
          accountHolderNameEncrypted: pending!.accountHolderNameEncrypted!,
          sortCodeEncrypted: pending!.sortCodeEncrypted!,
          accountNumberEncrypted: pending!.accountNumberEncrypted!,
        },
        cipher,
      ),
    ).toEqual({
      accountHolderName: "Alex Demo",
      sortCode: "200099",
      accountNumber: "55556789",
    });
    const [account] = await db
      .select()
      .from(customerPayoutAccounts)
      .where(eq(customerPayoutAccounts.customerId, alex));
    expect(JSON.stringify(account)).not.toContain("55556789");

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "customer.payout_details_changed"));
    expect(JSON.stringify(audits)).not.toContain("55556789");
    expect(JSON.stringify(audits)).toContain("6789");
  });
});

describe("price alerts", () => {
  it("creates, pauses and deletes alerts for the owner only", async () => {
    const created = await createPriceAlert(
      db,
      alex,
      priceAlertSchema.parse({
        type: "shop",
        modelSlug: "iphone-16",
        grade: "A",
        targetPounds: "450",
      }),
    );
    if (!created.ok) throw new Error(created.reason);
    expect((await listPriceAlerts(db, alex))[0]).toMatchObject({
      model: "Apple iPhone 16",
      grade: "A",
      targetPricePence: 45000,
      isActive: true,
    });
    expect(
      await createPriceAlert(
        db,
        alex,
        priceAlertSchema.parse({ type: "trade_in", modelSlug: "nokia-3310", targetPounds: 10 }),
      ),
    ).toEqual({ ok: false, reason: "unknown_model" });
    // Trade-in alerts ignore grade.
    expect(
      priceAlertSchema.parse({
        type: "trade_in",
        modelSlug: "iphone-13",
        grade: "B",
        targetPounds: 100,
      }).grade,
    ).toBeNull();

    expect(await setPriceAlertActive(db, dee, created.id, false)).toBe(false);
    expect(await setPriceAlertActive(db, alex, created.id, false)).toBe(true);
    expect(await deletePriceAlert(db, alex, created.id)).toBe(true);
    expect(await db.select().from(priceAlerts).where(eq(priceAlerts.id, created.id))).toEqual([]);
  });
});

describe("privacy", () => {
  it("records marketing consent changes", async () => {
    await setMarketingPreferences(db, alex, { email: true, sms: false });
    const [row] = await db.select().from(customers).where(eq(customers.id, alex));
    expect(row).toMatchObject({ marketingOptIn: true, marketingSmsOptIn: false });
    expect(row!.marketingUpdatedAt).toBeInstanceOf(Date);
    const consent = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "customer.marketing_consent"), eq(auditLog.entityId, alex)));
    expect(consent).toHaveLength(1);
  });

  it("exports the customer's data without bank details in full", async () => {
    const data = await exportCustomerData(db, alex);
    expect(data!.profile.email).toBe(DEMO.quotes);
    expect(data!.tradeIns).toHaveLength(4);
    expect(data!.orders.map((o) => o.orderNumber).sort()).toEqual(["RU-900001", "RU-900002"]);
    expect(data!.orders[0]!.items).toHaveLength(1);
    const json = JSON.stringify(data);
    expect(json).not.toContain("11223344");
    expect(json).not.toContain("55556789");
    expect(json).not.toMatch(/Encrypted/);
  });

  it("won't delete an account with things in progress", async () => {
    expect(await deletionBlockers(db, alex)).toEqual(
      expect.arrayContaining(["trade_in_in_progress", "order_in_progress", "payout_pending"]),
    );
    const { code } = await issueVerificationCode(db, alex, "delete_account");
    expect(await deleteCustomerAccount(db, { customerId: alex, code })).toMatchObject({
      ok: false,
      reason: "blocked",
    });
  });

  it("erases a customer: deletes what it can, anonymises what must be kept", async () => {
    expect(await deletionBlockers(db, dee)).toEqual([]);
    expect(await deleteCustomerAccount(db, { customerId: dee, code: "000000" })).toMatchObject({
      ok: false,
    });
    // Push notifications about the account and its order.
    const [deeOrder] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.customerId, dee));
    const endpoint = "https://fcm.googleapis.com/fcm/send/dee-phone";
    const subscription = { endpoint, keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } };
    await savePushTopic(db, {
      subscription,
      target: { kind: "price_alerts", customerId: dee },
      pathEncrypted: null,
    });
    await savePushTopic(db, {
      subscription,
      target: { kind: "order", orderId: deeOrder!.id },
      pathEncrypted: cipher.encrypt("/orders/token", "push_topic.path"),
    });

    const { code } = await issueVerificationCode(db, dee, "delete_account");
    expect(await deleteCustomerAccount(db, { customerId: dee, code })).toEqual({ ok: true });
    expect(
      await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)),
    ).toEqual([]);

    const [row] = await db.select().from(customers).where(eq(customers.id, dee));
    expect(row).toMatchObject({ email: redactedEmail(dee), name: null, phone: null });
    expect(row!.deletedAt).toBeInstanceOf(Date);
    expect(await listAddresses(db, dee)).toEqual([]);
    expect(await listPriceAlerts(db, dee)).toEqual([]);
    const [order] = await db.select().from(orders).where(eq(orders.customerId, dee));
    expect(order).toMatchObject({
      email: redactedEmail(dee),
      contactName: null,
      contactPhone: null,
      accessTokenHash: null,
      totalPence: 42900,
    });
    expect(order!.shippingAddress).toMatchObject({ name: "Deleted", postcode: "Deleted" });
    expect(JSON.stringify(await exportCustomerData(db, dee))).not.toContain("Dee Leet");
  });
});
