import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { deviceModels, modelVariants } from "./catalogue";
import {
  fulfilmentMethod,
  IMEI_PATTERN,
  orderStatus,
  paymentStatus,
  priceAlertType,
  productGrade,
  productStatus,
  reviewStatus,
  timestamps,
} from "./_shared";
import { customers, staffUsers } from "./people";
import { stores } from "./stores";
import { quotes } from "./trade-in";

export type ProductPhoto = {
  /** R2 object key. */
  key: string;
  alt: string;
};

export type PostalAddress = {
  name: string;
  line1: string;
  line2?: string;
  town: string;
  county?: string;
  postcode: string;
  country: "GB";
};

/** A single refurbished unit for sale. Each physical phone is one row. */
export const products = pgTable(
  "products",
  {
    id: uuid().primaryKey().defaultRandom(),
    /**
     * URL slug for /shop/[brand]/[slug], e.g. "iphone-15-128gb-black-k3x9q2"
     * (src/lib/shop/slug.ts). Never changes, so shared links keep working.
     */
    slug: text().notNull().unique("products_slug_unique"),
    variantId: uuid()
      .notNull()
      .references(() => modelVariants.id, { onDelete: "restrict" }),
    imei: varchar({ length: 15 }).notNull().unique(),
    grade: productGrade().notNull(),
    batteryHealthPercent: smallint().notNull(),
    photos: jsonb().$type<ProductPhoto[]>().notNull().default([]),
    pricePence: integer().notNull(),
    /** Where the unit physically is (for click and collect and stock). */
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    status: productStatus().notNull().default("draft"),
    /** R2 key of the data-wipe certificate PDF. Required before listing. */
    dataWipeCertificateKey: text(),
    warrantyMonths: smallint().notNull().default(12),
    /** The trade-in this unit came from, if bought from the public. */
    sourceQuoteId: uuid().references(() => quotes.id, { onDelete: "set null" }),
    listedAt: timestamp({ withTimezone: true }),
    soldAt: timestamp({ withTimezone: true }),
    /**
     * Checkout hold: the unit is kept for this pending order until
     * checkoutHoldUntil (15 minutes, longer while a payment is processing).
     * Expired holds can be taken over by another checkout.
     */
    checkoutHoldOrderId: uuid().references((): AnyPgColumn => orders.id, {
      onDelete: "set null",
    }),
    checkoutHoldUntil: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("products_variant_idx").on(t.variantId),
    index("products_store_idx").on(t.storeId),
    index("products_status_grade_idx").on(t.status, t.grade),
    index("products_status_listed_idx").on(t.status, t.listedAt),
    check("products_slug_check", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("products_imei_check", sql`${t.imei} ~ '${sql.raw(IMEI_PATTERN)}'`),
    check("products_battery_check", sql`${t.batteryHealthPercent} between 0 and 100`),
    check("products_price_check", sql`${t.pricePence} > 0`),
    check("products_warranty_check", sql`${t.warrantyMonths} >= 0`),
    check(
      "products_hold_check",
      sql`(${t.checkoutHoldOrderId} is null) = (${t.checkoutHoldUntil} is null)`,
    ),
    check(
      "products_wipe_certificate_check",
      sql`${t.status} in ('draft', 'withdrawn') or ${t.dataWipeCertificateKey} is not null`,
    ),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Customer-facing number, e.g. RU-100245. */
    orderNumber: text().notNull().unique("orders_order_number_unique"),
    /** Null for guest checkout. */
    customerId: uuid().references(() => customers.id, { onDelete: "restrict" }),
    email: text().notNull(),
    contactName: text(),
    /** E.164, e.g. +447700900123. */
    contactPhone: text(),
    status: orderStatus().notNull().default("pending_payment"),
    fulfilmentMethod: fulfilmentMethod().notNull(),
    /** Key from DELIVERY_OPTIONS in src/config/shop.ts (delivery orders only). */
    deliveryOptionKey: text(),
    collectionStoreId: uuid().references(() => stores.id, { onDelete: "restrict" }),
    shippingAddress: jsonb().$type<PostalAddress>(),
    subtotalPence: integer().notNull(),
    deliveryPence: integer().notNull().default(0),
    discountPence: integer().notNull().default(0),
    /** Trade-in quote whose value is taken off this order. */
    tradeInQuoteId: uuid().references(() => quotes.id, { onDelete: "restrict" }),
    tradeInCreditPence: integer().notNull().default(0),
    totalPence: integer().notNull(),
    currency: char({ length: 3 }).notNull().default("GBP"),
    stripeCheckoutSessionId: text().unique("orders_stripe_checkout_session_id_unique"),
    /** SHA-256 of the secret token in the customer's order link. */
    accessTokenHash: text().unique("orders_access_token_hash_unique"),
    /** The same token, encrypted (src/lib/crypto), so confirmation emails can link to the order. */
    accessTokenEncrypted: text(),
    /** End of the 15-minute checkout hold on the units. */
    expiresAt: timestamp({ withTimezone: true }),
    /** When the payment succeeded (set from the Stripe webhook only). */
    placedAt: timestamp({ withTimezone: true }),
    /** Dispatched or collected; the returns window starts from here. */
    fulfilledAt: timestamp({ withTimezone: true }),
    /** Delivery tracking, set when dispatched. */
    trackingCarrier: text(),
    trackingNumber: text(),
    /** Click and collect: when it was ready at the store. */
    readyForCollectionAt: timestamp({ withTimezone: true }),
    /** Delivered (or collected) and finished. */
    completedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("orders_customer_idx").on(t.customerId),
    index("orders_status_idx").on(t.status),
    // A trade-in can be credited to one live order (cancelled ones free it).
    uniqueIndex("orders_trade_in_quote_unique")
      .on(t.tradeInQuoteId)
      .where(sql`${t.status} <> 'cancelled'`),
    check(
      "orders_amounts_check",
      sql`${t.subtotalPence} >= 0 and ${t.deliveryPence} >= 0 and ${t.discountPence} >= 0 and ${t.tradeInCreditPence} >= 0 and ${t.totalPence} >= 0`,
    ),
    check(
      "orders_total_check",
      sql`${t.totalPence} = ${t.subtotalPence} + ${t.deliveryPence} - ${t.discountPence} - ${t.tradeInCreditPence}`,
    ),
    check(
      "orders_trade_in_check",
      sql`(${t.tradeInQuoteId} is null) = (${t.tradeInCreditPence} = 0)`,
    ),
    check(
      "orders_fulfilment_check",
      sql`(${t.fulfilmentMethod} = 'delivery' and ${t.shippingAddress} is not null) or (${t.fulfilmentMethod} = 'click_and_collect' and ${t.collectionStoreId} is not null)`,
    ),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    /** Snapshot at purchase, e.g. "iPhone 15, 128GB, Black, Grade A". */
    description: text().notNull(),
    unitPricePence: integer().notNull(),
    ...timestamps,
  },
  (t) => [
    unique("order_items_order_product_unique").on(t.orderId, t.productId),
    index("order_items_product_idx").on(t.productId),
    check("order_items_price_check", sql`${t.unitPricePence} >= 0`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    provider: text().notNull().default("stripe"),
    stripePaymentIntentId: text().unique("payments_stripe_payment_intent_id_unique"),
    amountPence: integer().notNull(),
    amountRefundedPence: integer().notNull().default(0),
    currency: char({ length: 3 }).notNull().default("GBP"),
    status: paymentStatus().notNull().default("requires_payment"),
    failureReason: text(),
    ...timestamps,
  },
  (t) => [
    index("payments_order_idx").on(t.orderId),
    check(
      "payments_amount_check",
      sql`${t.amountPence} >= 0 and ${t.amountRefundedPence} between 0 and ${t.amountPence}`,
    ),
  ],
);

/** Notify a customer when a price crosses their target. */
export const priceAlerts = pgTable(
  "price_alerts",
  {
    id: uuid().primaryKey().defaultRandom(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    /** shop: tell me when a unit drops to the target. trade_in: when our offer rises to it. */
    type: priceAlertType().notNull(),
    modelId: uuid()
      .notNull()
      .references(() => deviceModels.id, { onDelete: "cascade" }),
    /** Optional: narrow to one storage/colour. */
    variantId: uuid().references(() => modelVariants.id, { onDelete: "cascade" }),
    /** Optional for shop alerts: only this grade. */
    grade: productGrade(),
    targetPricePence: integer().notNull(),
    isActive: boolean().notNull().default(true),
    lastNotifiedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("price_alerts_customer_idx").on(t.customerId),
    index("price_alerts_active_model_idx")
      .on(t.modelId)
      .where(sql`${t.isActive}`),
    check("price_alerts_target_check", sql`${t.targetPricePence} > 0`),
  ],
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid().primaryKey().defaultRandom(),
    customerId: uuid().references(() => customers.id, { onDelete: "set null" }),
    displayName: text().notNull(),
    orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
    quoteId: uuid().references(() => quotes.id, { onDelete: "set null" }),
    modelId: uuid().references(() => deviceModels.id, { onDelete: "set null" }),
    storeId: uuid().references(() => stores.id, { onDelete: "set null" }),
    rating: smallint().notNull(),
    title: text(),
    body: text().notNull(),
    status: reviewStatus().notNull().default("pending"),
    /** True when linked to a completed order or paid trade-in. */
    isVerified: boolean().notNull().default(false),
    moderatedBy: uuid().references(() => staffUsers.id, { onDelete: "set null" }),
    publishedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("reviews_model_idx").on(t.modelId),
    index("reviews_store_idx").on(t.storeId),
    index("reviews_status_idx").on(t.status),
    check("reviews_rating_check", sql`${t.rating} between 1 and 5`),
  ],
);

/**
 * "Tell me when a similar phone is in stock", from a sold unit's page.
 * Guests can sign up with just an email; each alert has its own
 * unsubscribe link (only the token's hash is stored).
 */
export const stockAlerts = pgTable(
  "stock_alerts",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Stored lower-case. */
    email: text().notNull(),
    customerId: uuid().references(() => customers.id, { onDelete: "set null" }),
    modelId: uuid()
      .notNull()
      .references(() => deviceModels.id, { onDelete: "cascade" }),
    /** Null: any storage. */
    storageGb: integer(),
    /** The sold unit the customer signed up from. */
    sourceProductId: uuid().references(() => products.id, { onDelete: "set null" }),
    /** sha256 of the unsubscribe token. */
    unsubscribeTokenHash: text().notNull().unique("stock_alerts_unsubscribe_token_hash_unique"),
    isActive: boolean().notNull().default(true),
    consentedAt: timestamp({ withTimezone: true }).notNull(),
    lastNotifiedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("stock_alerts_active_unique")
      .on(sql`lower(${t.email})`, t.modelId, sql`coalesce(${t.storageGb}, 0)`)
      .where(sql`${t.isActive}`),
    index("stock_alerts_active_model_idx")
      .on(t.modelId)
      .where(sql`${t.isActive}`),
    check("stock_alerts_email_check", sql`${t.email} = lower(${t.email})`),
    check("stock_alerts_storage_check", sql`${t.storageGb} is null or ${t.storageGb} > 0`),
  ],
);
