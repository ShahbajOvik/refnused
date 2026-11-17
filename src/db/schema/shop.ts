import { sql } from "drizzle-orm";
import {
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
    ...timestamps,
  },
  (t) => [
    index("products_variant_idx").on(t.variantId),
    index("products_store_idx").on(t.storeId),
    index("products_status_grade_idx").on(t.status, t.grade),
    check("products_imei_check", sql`${t.imei} ~ '${sql.raw(IMEI_PATTERN)}'`),
    check("products_battery_check", sql`${t.batteryHealthPercent} between 0 and 100`),
    check("products_price_check", sql`${t.pricePence} > 0`),
    check("products_warranty_check", sql`${t.warrantyMonths} >= 0`),
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
    status: orderStatus().notNull().default("pending_payment"),
    fulfilmentMethod: fulfilmentMethod().notNull(),
    collectionStoreId: uuid().references(() => stores.id, { onDelete: "restrict" }),
    shippingAddress: jsonb().$type<PostalAddress>(),
    subtotalPence: integer().notNull(),
    deliveryPence: integer().notNull().default(0),
    discountPence: integer().notNull().default(0),
    totalPence: integer().notNull(),
    currency: char({ length: 3 }).notNull().default("GBP"),
    stripeCheckoutSessionId: text().unique("orders_stripe_checkout_session_id_unique"),
    placedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("orders_customer_idx").on(t.customerId),
    index("orders_status_idx").on(t.status),
    check(
      "orders_amounts_check",
      sql`${t.subtotalPence} >= 0 and ${t.deliveryPence} >= 0 and ${t.discountPence} >= 0 and ${t.totalPence} >= 0`,
    ),
    check(
      "orders_total_check",
      sql`${t.totalPence} = ${t.subtotalPence} + ${t.deliveryPence} - ${t.discountPence}`,
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
