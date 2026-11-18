import { and, eq } from "drizzle-orm";

import * as schema from "@/db/schema";
import type { AppDb } from "@/db/types";
import type { FieldCipher } from "@/lib/crypto/field-encryption";
import { getSellModel } from "@/lib/sell/catalogue";
import { createQuote, createQuoteSchema } from "@/lib/sell/quote-service";
import { withImeiCheckDigit } from "@/lib/validation/uk";

import { sampleTradeInPence } from "./catalogue";

/*
 * Demo customers with trade-ins and orders at every stage, for tests and
 * demos of /account. Only used by the test database snapshot and tests,
 * never by `npm run db:seed`. Run after seed().
 */

export const DEMO = {
  quotes: "demo.alex@example.co.uk",
  deletable: "demo.dee@example.co.uk",
  /** Used by the admin tests (kept apart from the account tests' customers). */
  admin: "demo.sam@example.co.uk",
} as const;

/** Demo staff for admin tests. TOTP secret is a public test value: test data only. */
export const DEMO_STAFF = {
  owner: { email: "demo.owner@example.co.uk", name: "Olivia Owner", role: "owner" },
  staff: { email: "demo.staff@example.co.uk", name: "Sid Staff", role: "staff" },
} as const;
export const DEMO_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

const DAY = 86_400_000;
const perfect = {
  network: "unlocked",
  powers_on: "yes",
  screen: "perfect",
  body: "perfect",
  battery: "good",
  biometrics: "works",
};

let imeiCounter = 0;
const demoImei = () => withImeiCheckDigit(`3599999999${String(++imeiCounter).padStart(4, "0")}`);

export async function seedDemoAccounts(db: AppDb, cipher: FieldCipher, now = new Date()) {
  const [existing] = await db
    .select({ id: schema.customers.id })
    .from(schema.customers)
    .where(eq(schema.customers.email, DEMO.quotes));
  if (existing) return;

  const iphone15 = await getSellModel(db, "apple", "iphone-15");
  const variant = iphone15!.variants.find((v) => v.storageGb === 128 && v.colour === "Black")!;
  const offer = sampleTradeInPence(26000, 0, "A");

  async function quote(email: string, name: string) {
    const result = await createQuote(
      db,
      createQuoteSchema.parse({
        variantId: variant.id,
        answers: perfect,
        expectedOfferPence: offer,
        delivery: { method: "postage_pack" },
        name,
        email,
        phone: "07700 900111",
        address: { line1: "1 Demo Street", town: "North Shields", postcode: "NE29 6RR" },
        imei: demoImei(),
        bank: { accountHolderName: name, sortCode: "11-22-33", accountNumber: "11223344" },
        declarations: { owner: true, activationLockOff: true },
      }),
      { cipher, now: new Date(now.getTime() - 10 * DAY) },
    );
    if (!result.ok) throw new Error(`demo quote failed: ${result.reason}`);
    return result;
  }

  const [inspector] = await db
    .insert(schema.staffUsers)
    .values({ email: "demo.inspector@example.co.uk", name: "Demo Inspector", role: "staff" })
    .onConflictDoNothing()
    .returning({ id: schema.staffUsers.id });
  const staffId =
    inspector?.id ??
    (
      await db
        .select({ id: schema.staffUsers.id })
        .from(schema.staffUsers)
        .where(eq(schema.staffUsers.email, "demo.inspector@example.co.uk"))
    )[0]!.id;

  async function inspect(quoteId: string, revisedPricePence: number | null) {
    await db
      .update(schema.quotes)
      .set({
        status: revisedPricePence === null ? "approved" : "revised",
        receivedAt: new Date(now.getTime() - 6 * DAY),
      })
      .where(eq(schema.quotes.id, quoteId));
    await db.insert(schema.inspections).values({
      quoteId,
      staffId,
      actualGrade: revisedPricePence === null ? "A" : "C",
      revisedPricePence,
      revisedOfferStatus: revisedPricePence === null ? "not_required" : "pending",
      checkmendResult: "clear",
      notes: revisedPricePence === null ? null : "Deep scratch across the back glass.",
      inspectedAt: new Date(now.getTime() - 5 * DAY),
    });
  }

  // Alex: one trade-in at each stage.
  await quote(DEMO.quotes, "Alex Demo"); // accepted, waiting for the phone
  const toAccept = await quote(DEMO.quotes, "Alex Demo");
  await inspect(toAccept.quoteId, 16000);
  const toReturn = await quote(DEMO.quotes, "Alex Demo");
  await inspect(toReturn.quoteId, 15000);
  const paid = await quote(DEMO.quotes, "Alex Demo");
  await inspect(paid.quoteId, null);
  await db.update(schema.quotes).set({ status: "paid" }).where(eq(schema.quotes.id, paid.quoteId));
  await db
    .update(schema.payouts)
    .set({ status: "paid", paidAt: new Date(now.getTime() - 3 * DAY) })
    .where(eq(schema.payouts.quoteId, paid.quoteId));

  const [alex] = await db
    .select({ id: schema.customers.id })
    .from(schema.customers)
    .where(eq(schema.customers.email, DEMO.quotes));
  await db.insert(schema.customerAddresses).values({
    customerId: alex!.id,
    label: "Home",
    name: "Alex Demo",
    line1: "1 Demo Street",
    town: "North Shields",
    postcode: "NE29 6RR",
    isDefault: true,
  });

  // Units the demo customers bought (sold, so they don't change shop stock).
  const store = (
    await db
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(eq(schema.stores.slug, "metrotech-north-shields"))
  )[0]!;
  async function soldUnit(slug: string, pricePence: number) {
    const [row] = await db
      .insert(schema.products)
      .values({
        slug,
        variantId: variant.id,
        imei: demoImei(),
        grade: "A",
        batteryHealthPercent: 95,
        pricePence,
        storeId: store.id,
        status: "sold",
        dataWipeCertificateKey: `certificates/${slug}.pdf`,
        listedAt: new Date(now.getTime() - 30 * DAY),
        soldAt: new Date(now.getTime() - 3 * DAY),
      })
      .returning({ id: schema.products.id });
    return row!.id;
  }

  async function order(input: {
    customerId: string;
    email: string;
    number: string;
    productId: string;
    pricePence: number;
    placedDaysAgo: number;
    method: "delivery" | "click_and_collect";
    status: "paid" | "dispatched" | "ready_for_collection" | "completed";
  }) {
    const placedAt = new Date(now.getTime() - input.placedDaysAgo * DAY);
    const shipped =
      input.method === "delivery" &&
      (input.status === "dispatched" || input.status === "completed");
    const [row] = await db
      .insert(schema.orders)
      .values({
        orderNumber: input.number,
        customerId: input.customerId,
        email: input.email,
        contactName: "Demo Customer",
        contactPhone: "+447700900111",
        status: input.status,
        fulfilmentMethod: input.method,
        deliveryOptionKey: input.method === "delivery" ? "tracked-48" : null,
        collectionStoreId: input.method === "click_and_collect" ? store.id : null,
        shippingAddress:
          input.method === "delivery"
            ? {
                name: "Demo Customer",
                line1: "1 Demo Street",
                town: "North Shields",
                postcode: "NE29 6RR",
                country: "GB",
              }
            : null,
        subtotalPence: input.pricePence,
        totalPence: input.pricePence,
        placedAt,
        fulfilledAt:
          input.status === "dispatched" || input.status === "completed"
            ? new Date(placedAt.getTime() + DAY)
            : null,
        trackingCarrier: shipped ? "Royal Mail" : null,
        trackingNumber: shipped ? "AB123456789GB" : null,
        readyForCollectionAt:
          input.status === "ready_for_collection" ? new Date(placedAt.getTime() + DAY / 4) : null,
        completedAt: input.status === "completed" ? new Date(placedAt.getTime() + 3 * DAY) : null,
      })
      .returning({ id: schema.orders.id });
    await db.insert(schema.orderItems).values({
      orderId: row!.id,
      productId: input.productId,
      description: "Apple iPhone 15, 128GB, Black, Grade A",
      unitPricePence: input.pricePence,
    });
    await db.insert(schema.payments).values({
      orderId: row!.id,
      stripePaymentIntentId: `pi_demo_${input.number.replace(/\W/g, "")}`,
      amountPence: input.pricePence,
      status: "succeeded",
    });
  }

  await order({
    customerId: alex!.id,
    email: DEMO.quotes,
    number: "RU-900001",
    productId: await soldUnit("iphone-15-128gb-black-demo01", 45900),
    pricePence: 45900,
    placedDaysAgo: 3,
    method: "delivery",
    status: "dispatched",
  });
  await order({
    customerId: alex!.id,
    email: DEMO.quotes,
    number: "RU-900002",
    productId: await soldUnit("iphone-15-128gb-black-demo02", 44900),
    pricePence: 44900,
    placedDaysAgo: 1,
    method: "click_and_collect",
    status: "ready_for_collection",
  });

  // Dee: nothing in progress, so the account can be deleted.
  const [dee] = await db
    .insert(schema.customers)
    .values({ email: DEMO.deletable, name: "Dee Leet", phone: "+447700900222" })
    .returning({ id: schema.customers.id });
  await order({
    customerId: dee!.id,
    email: DEMO.deletable,
    number: "RU-900003",
    productId: await soldUnit("iphone-15-128gb-black-demo03", 42900),
    pricePence: 42900,
    placedDaysAgo: 60,
    method: "delivery",
    status: "completed",
  });
  await db.insert(schema.customerAddresses).values({
    customerId: dee!.id,
    name: "Dee Leet",
    line1: "2 Demo Road",
    town: "South Shields",
    postcode: "NE33 1HT",
    isDefault: true,
  });
  const [model] = await db
    .select({ id: schema.deviceModels.id })
    .from(schema.deviceModels)
    .where(and(eq(schema.deviceModels.slug, "pixel-9")));
  await db.insert(schema.priceAlerts).values({
    customerId: dee!.id,
    type: "shop",
    modelId: model!.id,
    targetPricePence: 30000,
  });

  // Demo staff with two-step verification already set up.
  for (const member of Object.values(DEMO_STAFF)) {
    await db
      .insert(schema.staffUsers)
      .values({
        email: member.email,
        name: member.name,
        role: member.role,
        totpSecretEncrypted: cipher.encrypt(DEMO_TOTP_SECRET, "staff_users.totp_secret"),
        totpEnabledAt: now,
      })
      .onConflictDoNothing();
  }

  // Store details for the store pages (test data only; real hours are set in /admin/stores).
  const weekday = { opens: "09:00", closes: "17:30" };
  await db
    .update(schema.stores)
    .set({
      openingHours: {
        mon: weekday,
        tue: weekday,
        wed: weekday,
        thu: weekday,
        fri: weekday,
        sat: { opens: "10:00", closes: "16:00" },
        sun: null,
      },
      parkingInfo: "Demo parking text: on-street pay-and-display parking nearby.",
    })
    .where(eq(schema.stores.slug, "metrotech-north-shields"));
  await db.insert(schema.reviews).values({
    displayName: "Demo reviewer",
    storeId: store.id,
    rating: 5,
    title: "Demo review",
    body: "Test data for the store page. Not a real review.",
    status: "published",
    publishedAt: new Date(now.getTime() - 2 * DAY),
  });

  // Sam: work for the admin tests.
  await quote(DEMO.admin, "Sam Admin"); // waiting for the phone
  await quote(DEMO.admin, "Sam Admin"); // a second one, to approve
  const ready = await quote(DEMO.admin, "Sam Admin");
  await inspect(ready.quoteId, null); // approved: payout ready
  const [sam] = await db
    .select({ id: schema.customers.id })
    .from(schema.customers)
    .where(eq(schema.customers.email, DEMO.admin));
  await order({
    customerId: sam!.id,
    email: DEMO.admin,
    number: "RU-900010",
    productId: await soldUnit("iphone-15-128gb-black-demo10", 46900),
    pricePence: 46900,
    placedDaysAgo: 0,
    method: "delivery",
    status: "paid",
  });
  const [samOrder] = await db
    .select({ id: schema.orders.id, itemId: schema.orderItems.id })
    .from(schema.orders)
    .innerJoin(schema.orderItems, eq(schema.orderItems.orderId, schema.orders.id))
    .where(eq(schema.orders.orderNumber, "RU-900010"));
  await db.insert(schema.orderRequests).values({
    reference: "RU-R-DEMO10",
    orderId: samOrder!.id,
    orderItemId: samOrder!.itemId,
    type: "return",
    reason: "changed_mind",
    description: "Ordered the wrong colour, sorry.",
  });
}
