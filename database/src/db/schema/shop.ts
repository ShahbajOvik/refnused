import { sql } from "drizzle-orm";
import {
  type AnyMySqlColumn,
  boolean,
  char,
  check,
  index,
  int,
  json,
  mysqlTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

import { deviceModels, modelVariants } from "./catalogue";
import {
  fulfilmentMethod,
  id,
  IMEI_PATTERN,
  orderStatus,
  paymentStatus,
  priceAlertType,
  productGrade,
  productStatus,
  reviewStatus,
  timestamps,
  ts,
  uuidRef,
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

/** A single refurbished unit for sale. Each physical item is one row. */
export const products = mysqlTable(
  "products",
  {
    id: id(),
    /**
     * URL slug for /shop/[brand]/[slug], e.g. "iphone-15-128gb-black-k3x9q2"
     * (src/lib/shop/slug.ts). Never changes, so shared links keep working.
     */
    slug: varchar({ length: 191 }).notNull().unique("products_slug_unique"),
    variantId: uuidRef()
      .notNull()
      .references(() => modelVariants.id, { onDelete: "restrict" }),
    /** Set for IMEI categories; every other unit has a serialNumber instead. */
    imei: varchar({ length: 15 }).unique(),
    /** Upper-case serial number or generated stock code. */
    serialNumber: varchar({ length: 64 }).unique(),
    grade: productGrade().notNull(),
    /** Null for items without a battery. */
    batteryHealthPercent: smallint(),
    photos: json()
      .$type<ProductPhoto[]>()
      .notNull()
      .default(sql`(JSON_ARRAY())`),
    pricePence: int().notNull(),
    /** Where the unit physically is (for click and collect and stock). */
    storeId: uuidRef()
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    status: productStatus().notNull().default("draft"),
    /** Copied from the category at intake. Accessories hold no customer data. */
    dataWipeRequired: boolean().notNull().default(true),
    /** R2 key of the data-wipe certificate PDF. Required before listing if dataWipeRequired. */
    dataWipeCertificateKey: text(),
    warrantyMonths: smallint().notNull().default(12),
    /** The trade-in this unit came from, if bought from the public. */
    sourceQuoteId: uuidRef().references(() => quotes.id, { onDelete: "set null" }),
    listedAt: ts(),
    soldAt: ts(),
    /**
     * Checkout hold: the unit is kept for this pending order until
     * checkoutHoldUntil (15 minutes, longer while a payment is processing).
     * Expired holds can be taken over by another checkout.
     */
    // RESTRICT, not SET NULL: MySQL can't CHECK a column used by a
    // referential action, and products_hold_check needs this one. Orders are
    // never deleted (accounts are anonymised instead).
    checkoutHoldOrderId: uuidRef().references((): AnyMySqlColumn => orders.id, {
      onDelete: "restrict",
    }),
    checkoutHoldUntil: ts(),
    ...timestamps,
  },
  (t) => [
    index("products_variant_idx").on(t.variantId),
    index("products_store_idx").on(t.storeId),
    index("products_status_grade_idx").on(t.status, t.grade),
    index("products_status_listed_idx").on(t.status, t.listedAt),
    // 'c': case-sensitive regexes, despite the case-insensitive collation.
    check("products_slug_check", sql`regexp_like(${t.slug}, '^[a-z0-9]+(-[a-z0-9]+)*$', 'c')`),
    check("products_imei_check", sql`regexp_like(${t.imei}, '${sql.raw(IMEI_PATTERN)}')`),
    check("products_identifier_check", sql`(${t.imei} is null) <> (${t.serialNumber} is null)`),
    check(
      "products_serial_check",
      sql`${t.serialNumber} is null or regexp_like(${t.serialNumber}, '^[A-Z0-9][A-Z0-9._/-]{2,63}$', 'c')`,
    ),
    check("products_battery_check", sql`${t.batteryHealthPercent} between 0 and 100`),
    check("products_price_check", sql`${t.pricePence} > 0`),
    check("products_warranty_check", sql`${t.warrantyMonths} >= 0`),
    check(
      "products_hold_check",
      sql`(${t.checkoutHoldOrderId} is null) = (${t.checkoutHoldUntil} is null)`,
    ),
    check(
      "products_wipe_certificate_check",
      sql`${t.status} in ('draft', 'withdrawn') or not ${t.dataWipeRequired} or ${t.dataWipeCertificateKey} is not null`,
    ),
  ],
);

export const orders = mysqlTable(
  "orders",
  {
    id: id(),
    /** Customer-facing number, e.g. RU-100245. */
    orderNumber: varchar({ length: 32 }).notNull().unique("orders_order_number_unique"),
    /** Null for guest checkout. */
    customerId: uuidRef().references(() => customers.id, { onDelete: "restrict" }),
    email: varchar({ length: 254 }).notNull(),
    contactName: text(),
    /** E.164, e.g. +447700900123. */
    contactPhone: varchar({ length: 32 }),
    status: orderStatus().notNull().default("pending_payment"),
    fulfilmentMethod: fulfilmentMethod().notNull(),
    /** Key from DELIVERY_OPTIONS in src/config/shop.ts (delivery orders only). */
    deliveryOptionKey: varchar({ length: 64 }),
    collectionStoreId: uuidRef().references(() => stores.id, { onDelete: "restrict" }),
    shippingAddress: json().$type<PostalAddress>(),
    subtotalPence: int().notNull(),
    deliveryPence: int().notNull().default(0),
    discountPence: int().notNull().default(0),
    /** Trade-in quote whose value is taken off this order. */
    tradeInQuoteId: uuidRef().references(() => quotes.id, { onDelete: "restrict" }),
    tradeInCreditPence: int().notNull().default(0),
    totalPence: int().notNull(),
    currency: char({ length: 3 }).notNull().default("GBP"),
    stripeCheckoutSessionId: varchar({ length: 255 }).unique(
      "orders_stripe_checkout_session_id_unique",
    ),
    /** SHA-256 of the secret token in the customer's order link. */
    accessTokenHash: varchar({ length: 128 }).unique("orders_access_token_hash_unique"),
    /** The same token, encrypted (src/lib/crypto), so confirmation emails can link to the order. */
    accessTokenEncrypted: text(),
    /** End of the 15-minute checkout hold on the units. */
    expiresAt: ts(),
    /** When the payment succeeded (set from the Stripe webhook only). */
    placedAt: ts(),
    /** Dispatched or collected; the returns window starts from here. */
    fulfilledAt: ts(),
    /** Delivery tracking, set when dispatched. */
    trackingCarrier: varchar({ length: 64 }),
    trackingNumber: varchar({ length: 100 }),
    /** Click and collect: when it was ready at the store. */
    readyForCollectionAt: ts(),
    /** Delivered (or collected) and finished. */
    completedAt: ts(),
    ...timestamps,
  },
  (t) => [
    index("orders_customer_idx").on(t.customerId),
    index("orders_status_idx").on(t.status),
    // A trade-in can be credited to one live order (cancelled ones free it).
    uniqueIndex("orders_trade_in_quote_unique").on(
      sql`(case when ${t.status} <> 'cancelled' then ${t.tradeInQuoteId} end)`,
    ),
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

export const orderItems = mysqlTable(
  "order_items",
  {
    id: id(),
    orderId: uuidRef()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuidRef()
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    /** Snapshot at purchase, e.g. "iPhone 15, 128GB, Black, Grade A". */
    description: text().notNull(),
    unitPricePence: int().notNull(),
    ...timestamps,
  },
  (t) => [
    unique("order_items_order_product_unique").on(t.orderId, t.productId),
    index("order_items_product_idx").on(t.productId),
    check("order_items_price_check", sql`${t.unitPricePence} >= 0`),
  ],
);

export const payments = mysqlTable(
  "payments",
  {
    id: id(),
    orderId: uuidRef()
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    provider: varchar({ length: 32 }).notNull().default("stripe"),
    stripePaymentIntentId: varchar({ length: 255 }).unique(
      "payments_stripe_payment_intent_id_unique",
    ),
    amountPence: int().notNull(),
    amountRefundedPence: int().notNull().default(0),
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
export const priceAlerts = mysqlTable(
  "price_alerts",
  {
    id: id(),
    customerId: uuidRef()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    /** shop: tell me when a unit drops to the target. trade_in: when our offer rises to it. */
    type: priceAlertType().notNull(),
    modelId: uuidRef()
      .notNull()
      .references(() => deviceModels.id, { onDelete: "cascade" }),
    /** Optional: narrow to one storage/colour. */
    variantId: uuidRef().references(() => modelVariants.id, { onDelete: "cascade" }),
    /** Optional for shop alerts: only this grade. */
    grade: productGrade(),
    targetPricePence: int().notNull(),
    isActive: boolean().notNull().default(true),
    lastNotifiedAt: ts(),
    ...timestamps,
  },
  (t) => [
    index("price_alerts_customer_idx").on(t.customerId),
    index("price_alerts_active_model_idx").on(t.modelId, t.isActive),
    check("price_alerts_target_check", sql`${t.targetPricePence} > 0`),
  ],
);

export const reviews = mysqlTable(
  "reviews",
  {
    id: id(),
    customerId: uuidRef().references(() => customers.id, { onDelete: "set null" }),
    displayName: varchar({ length: 100 }).notNull(),
    orderId: uuidRef().references(() => orders.id, { onDelete: "set null" }),
    quoteId: uuidRef().references(() => quotes.id, { onDelete: "set null" }),
    modelId: uuidRef().references(() => deviceModels.id, { onDelete: "set null" }),
    storeId: uuidRef().references(() => stores.id, { onDelete: "set null" }),
    rating: smallint().notNull(),
    title: text(),
    body: text().notNull(),
    status: reviewStatus().notNull().default("pending"),
    /** True when linked to a completed order or paid trade-in. */
    isVerified: boolean().notNull().default(false),
    moderatedBy: uuidRef().references(() => staffUsers.id, { onDelete: "set null" }),
    publishedAt: ts(),
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
export const stockAlerts = mysqlTable(
  "stock_alerts",
  {
    id: id(),
    /** Stored lower-case. */
    email: varchar({ length: 254 }).notNull(),
    customerId: uuidRef().references(() => customers.id, { onDelete: "set null" }),
    modelId: uuidRef()
      .notNull()
      .references(() => deviceModels.id, { onDelete: "cascade" }),
    /** Null: any storage. */
    storageGb: int(),
    /** The sold unit the customer signed up from. */
    sourceProductId: uuidRef().references(() => products.id, { onDelete: "set null" }),
    /** sha256 of the unsubscribe token. */
    unsubscribeTokenHash: varchar({ length: 128 })
      .notNull()
      .unique("stock_alerts_unsubscribe_token_hash_unique"),
    isActive: boolean().notNull().default(true),
    consentedAt: ts().notNull(),
    lastNotifiedAt: ts(),
    ...timestamps,
  },
  (t) => [
    // One active alert per email, model and storage (inactive ones are NULL
    // in the first part, so they never clash; the collation ignores case).
    uniqueIndex("stock_alerts_active_unique").on(
      sql`(case when ${t.isActive} then ${t.email} end)`,
      t.modelId,
      sql`(coalesce(${t.storageGb}, 0))`,
    ),
    index("stock_alerts_active_model_idx").on(t.modelId, t.isActive),
    // Binary comparison: the collation would treat "A" and "a" as equal.
    check(
      "stock_alerts_email_check",
      sql`cast(${t.email} as binary) = cast(lower(${t.email}) as binary)`,
    ),
    check("stock_alerts_storage_check", sql`${t.storageGb} is null or ${t.storageGb} > 0`),
  ],
);
