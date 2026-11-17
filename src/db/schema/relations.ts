import { relations } from "drizzle-orm";

import { brands, deviceModels, modelVariants, tradeInPrices } from "./catalogue";
import { customers, staffUsers } from "./people";
import { orderItems, orders, payments, priceAlerts, products, reviews } from "./shop";
import { stores } from "./stores";
import { inspections, payouts, quotes } from "./trade-in";

export const brandsRelations = relations(brands, ({ many }) => ({
  models: many(deviceModels),
}));

export const deviceModelsRelations = relations(deviceModels, ({ one, many }) => ({
  brand: one(brands, { fields: [deviceModels.brandId], references: [brands.id] }),
  variants: many(modelVariants),
  reviews: many(reviews),
}));

export const modelVariantsRelations = relations(modelVariants, ({ one, many }) => ({
  model: one(deviceModels, { fields: [modelVariants.modelId], references: [deviceModels.id] }),
  tradeInPrices: many(tradeInPrices),
  products: many(products),
  quotes: many(quotes),
}));

export const tradeInPricesRelations = relations(tradeInPrices, ({ one }) => ({
  variant: one(modelVariants, {
    fields: [tradeInPrices.variantId],
    references: [modelVariants.id],
  }),
  updatedByStaff: one(staffUsers, {
    fields: [tradeInPrices.updatedBy],
    references: [staffUsers.id],
  }),
}));

export const storesRelations = relations(stores, ({ many }) => ({
  staff: many(staffUsers),
  products: many(products),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  quotes: many(quotes),
  orders: many(orders),
  payouts: many(payouts),
  priceAlerts: many(priceAlerts),
  reviews: many(reviews),
}));

export const staffUsersRelations = relations(staffUsers, ({ one, many }) => ({
  store: one(stores, { fields: [staffUsers.storeId], references: [stores.id] }),
  inspections: many(inspections),
}));

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  customer: one(customers, { fields: [quotes.customerId], references: [customers.id] }),
  variant: one(modelVariants, { fields: [quotes.variantId], references: [modelVariants.id] }),
  dropOffStore: one(stores, { fields: [quotes.dropOffStoreId], references: [stores.id] }),
  inspections: many(inspections),
  payout: one(payouts),
}));

export const inspectionsRelations = relations(inspections, ({ one }) => ({
  quote: one(quotes, { fields: [inspections.quoteId], references: [quotes.id] }),
  staff: one(staffUsers, { fields: [inspections.staffId], references: [staffUsers.id] }),
}));

export const payoutsRelations = relations(payouts, ({ one }) => ({
  quote: one(quotes, { fields: [payouts.quoteId], references: [quotes.id] }),
  customer: one(customers, { fields: [payouts.customerId], references: [customers.id] }),
  processedByStaff: one(staffUsers, {
    fields: [payouts.processedBy],
    references: [staffUsers.id],
  }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  variant: one(modelVariants, { fields: [products.variantId], references: [modelVariants.id] }),
  store: one(stores, { fields: [products.storeId], references: [stores.id] }),
  sourceQuote: one(quotes, { fields: [products.sourceQuoteId], references: [quotes.id] }),
  orderItems: many(orderItems),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  collectionStore: one(stores, { fields: [orders.collectionStoreId], references: [stores.id] }),
  items: many(orderItems),
  payments: many(payments),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
}));

export const priceAlertsRelations = relations(priceAlerts, ({ one }) => ({
  customer: one(customers, { fields: [priceAlerts.customerId], references: [customers.id] }),
  model: one(deviceModels, { fields: [priceAlerts.modelId], references: [deviceModels.id] }),
  variant: one(modelVariants, { fields: [priceAlerts.variantId], references: [modelVariants.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  customer: one(customers, { fields: [reviews.customerId], references: [customers.id] }),
  order: one(orders, { fields: [reviews.orderId], references: [orders.id] }),
  model: one(deviceModels, { fields: [reviews.modelId], references: [deviceModels.id] }),
  store: one(stores, { fields: [reviews.storeId], references: [stores.id] }),
}));
