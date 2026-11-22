import { and, asc, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";

import {
  auditLog,
  brands,
  customerAccounts,
  customerAddresses,
  customerAuthenticators,
  customerPayoutAccounts,
  customers,
  customerSessions,
  customerVerificationCodes,
  deviceModels,
  inspections,
  modelVariants,
  orderItems,
  orderRequests,
  orders,
  payments,
  payouts,
  priceAlerts,
  products,
  pushSubscriptions,
  pushTopics,
  quotes,
  reviews,
  stockAlerts,
} from "@refnused/database/db/schema";
import type { AppDb } from "@refnused/database/db/types";
import { recordAudit, type RequestMeta } from "@refnused/database/lib/audit";
import { deleteIdlePushSubscriptions } from "@refnused/database/lib/push/service";

import { verifyCode, type CodeCheck } from "./verification";

/** Copy of a row without one key (for nesting rows under their parent). */
function without<T extends object, K extends keyof T>(row: T, key: K): Omit<T, K> {
  const copy = { ...row };
  delete copy[key];
  return copy;
}

/*
 * UK GDPR rights in the account: consent for marketing, a copy of your
 * data (Articles 15 and 20) and erasure (Article 17).
 *
 * Erasure deletes what we can and anonymises what we must keep: order and
 * payment records (6 years for HMRC) and trade-in records with the IMEI
 * (second-hand dealer and police checks). Bank details on completed
 * payouts stay encrypted for the same financial-records period.
 */

export const RETENTION_NOTE =
  "We keep anonymised order, payment and trade-in records (including phone IMEIs and encrypted payout details) for 6 years, because the law requires it for tax and second-hand goods checks. They can no longer be linked to you by name, email or phone.";

// Marketing ---------------------------------------------------------------------

export async function setMarketingPreferences(
  db: AppDb,
  customerId: string,
  prefs: { email: boolean; sms: boolean },
  options: { now?: Date; meta?: RequestMeta } = {},
) {
  const now = options.now ?? new Date();
  const [before] = await db
    .select({ email: customers.marketingOptIn, sms: customers.marketingSmsOptIn })
    .from(customers)
    .where(eq(customers.id, customerId));
  if (!before) return false;
  if (before.email === prefs.email && before.sms === prefs.sms) return true;
  await db
    .update(customers)
    .set({ marketingOptIn: prefs.email, marketingSmsOptIn: prefs.sms, marketingUpdatedAt: now })
    .where(eq(customers.id, customerId));
  // The audit log is our record of consent: when, how, and what changed.
  await recordAudit(
    db,
    {
      actorType: "customer",
      actorId: customerId,
      action: "customer.marketing_consent",
      entityType: "customer",
      entityId: customerId,
      changes: { before, after: { ...prefs, source: "account" } },
    },
    options.meta,
  );
  return true;
}

// Data export -------------------------------------------------------------------

/** Everything we hold about the customer, as plain JSON. Bank details are masked. */
export async function exportCustomerData(db: AppDb, customerId: string) {
  const [profile] = await db
    .select({
      email: customers.email,
      name: customers.name,
      phone: customers.phone,
      emailVerified: customers.emailVerified,
      marketingEmail: customers.marketingOptIn,
      marketingSms: customers.marketingSmsOptIn,
      marketingUpdatedAt: customers.marketingUpdatedAt,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(eq(customers.id, customerId));
  if (!profile) return null;

  const [
    addresses,
    payoutAccount,
    quoteRows,
    payoutRows,
    orderRows,
    priceAlertRows,
    stockAlertRows,
    reviewRows,
    signInMethods,
    passkeys,
    activity,
  ] = await Promise.all([
    db
      .select({
        label: customerAddresses.label,
        name: customerAddresses.name,
        line1: customerAddresses.line1,
        line2: customerAddresses.line2,
        town: customerAddresses.town,
        county: customerAddresses.county,
        postcode: customerAddresses.postcode,
        isDefault: customerAddresses.isDefault,
      })
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, customerId)),
    db
      .select({
        sortCode: sql<string>`concat('••-••-', ${customerPayoutAccounts.sortCodeLast2})`,
        accountNumberEnding: customerPayoutAccounts.accountNumberLast4,
        verifiedAt: customerPayoutAccounts.verifiedAt,
      })
      .from(customerPayoutAccounts)
      .where(eq(customerPayoutAccounts.customerId, customerId)),
    db
      .select({
        id: quotes.id,
        reference: quotes.reference,
        device: sql<string>`concat(${brands.name}, ' ', ${deviceModels.name}, ', ', ${modelVariants.storageGb}, 'GB, ', ${modelVariants.colour})`,
        status: quotes.status,
        quotedGrade: quotes.quotedGrade,
        answers: quotes.answers,
        offeredPricePence: quotes.offeredPricePence,
        priceLockedUntil: quotes.priceLockedUntil,
        imei: quotes.imei,
        deliveryMethod: quotes.deliveryMethod,
        contactName: quotes.contactName,
        contactEmail: quotes.contactEmail,
        contactPhone: quotes.contactPhone,
        contactAddress: quotes.contactAddress,
        acceptedAt: quotes.acceptedAt,
        receivedAt: quotes.receivedAt,
        createdAt: quotes.createdAt,
      })
      .from(quotes)
      .innerJoin(modelVariants, eq(quotes.variantId, modelVariants.id))
      .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
      .innerJoin(brands, eq(deviceModels.brandId, brands.id))
      .where(eq(quotes.customerId, customerId))
      .orderBy(asc(quotes.createdAt)),
    db
      .select({
        quoteReference: quotes.reference,
        amountPence: payouts.amountPence,
        method: payouts.method,
        status: payouts.status,
        accountNumberEnding: payouts.accountNumberLast4,
        paidAt: payouts.paidAt,
      })
      .from(payouts)
      .innerJoin(quotes, eq(payouts.quoteId, quotes.id))
      .where(eq(payouts.customerId, customerId)),
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        email: orders.email,
        contactName: orders.contactName,
        contactPhone: orders.contactPhone,
        fulfilmentMethod: orders.fulfilmentMethod,
        shippingAddress: orders.shippingAddress,
        subtotalPence: orders.subtotalPence,
        deliveryPence: orders.deliveryPence,
        tradeInCreditPence: orders.tradeInCreditPence,
        totalPence: orders.totalPence,
        placedAt: orders.placedAt,
        trackingCarrier: orders.trackingCarrier,
        trackingNumber: orders.trackingNumber,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.customerId, customerId))
      .orderBy(asc(orders.createdAt)),
    db
      .select({
        type: priceAlerts.type,
        modelId: priceAlerts.modelId,
        grade: priceAlerts.grade,
        targetPricePence: priceAlerts.targetPricePence,
        isActive: priceAlerts.isActive,
        createdAt: priceAlerts.createdAt,
      })
      .from(priceAlerts)
      .where(eq(priceAlerts.customerId, customerId)),
    db
      .select({
        modelId: stockAlerts.modelId,
        storageGb: stockAlerts.storageGb,
        isActive: stockAlerts.isActive,
        consentedAt: stockAlerts.consentedAt,
      })
      .from(stockAlerts)
      .where(
        or(
          eq(stockAlerts.customerId, customerId),
          eq(stockAlerts.email, profile.email.toLowerCase()),
        ),
      ),
    db
      .select({
        displayName: reviews.displayName,
        rating: reviews.rating,
        title: reviews.title,
        body: reviews.body,
        status: reviews.status,
        createdAt: reviews.createdAt,
      })
      .from(reviews)
      .where(eq(reviews.customerId, customerId)),
    db
      .select({ provider: customerAccounts.provider })
      .from(customerAccounts)
      .where(eq(customerAccounts.userId, customerId)),
    db
      .select({
        deviceType: customerAuthenticators.credentialDeviceType,
        backedUp: customerAuthenticators.credentialBackedUp,
      })
      .from(customerAuthenticators)
      .where(eq(customerAuthenticators.userId, customerId)),
    db
      .select({
        action: auditLog.action,
        at: auditLog.createdAt,
        ipAddress: auditLog.ipAddress,
        userAgent: auditLog.userAgent,
        changes: auditLog.changes,
      })
      .from(auditLog)
      .where(
        or(
          and(eq(auditLog.actorType, "customer"), eq(auditLog.actorId, customerId)),
          and(eq(auditLog.entityType, "customer"), eq(auditLog.entityId, customerId)),
        ),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(1000),
  ]);

  const quoteIds = quoteRows.map((q) => q.id);
  const orderIds = orderRows.map((o) => o.id);
  const [inspectionRows, itemRows, requestRows, paymentRows] = await Promise.all([
    quoteIds.length
      ? db
          .select({
            quoteId: inspections.quoteId,
            actualGrade: inspections.actualGrade,
            revisedPricePence: inspections.revisedPricePence,
            revisedOfferStatus: inspections.revisedOfferStatus,
            checkmendResult: inspections.checkmendResult,
            notes: inspections.notes,
            inspectedAt: inspections.inspectedAt,
          })
          .from(inspections)
          .where(inArray(inspections.quoteId, quoteIds))
      : [],
    orderIds.length
      ? db
          .select({
            orderId: orderItems.orderId,
            description: orderItems.description,
            unitPricePence: orderItems.unitPricePence,
            productSlug: products.slug,
          })
          .from(orderItems)
          .innerJoin(products, eq(orderItems.productId, products.id))
          .where(inArray(orderItems.orderId, orderIds))
      : [],
    orderIds.length
      ? db
          .select({
            orderId: orderRequests.orderId,
            reference: orderRequests.reference,
            type: orderRequests.type,
            reason: orderRequests.reason,
            description: orderRequests.description,
            status: orderRequests.status,
            createdAt: orderRequests.createdAt,
          })
          .from(orderRequests)
          .where(inArray(orderRequests.orderId, orderIds))
      : [],
    orderIds.length
      ? db
          .select({
            orderId: payments.orderId,
            provider: payments.provider,
            amountPence: payments.amountPence,
            amountRefundedPence: payments.amountRefundedPence,
            status: payments.status,
            createdAt: payments.createdAt,
          })
          .from(payments)
          .where(inArray(payments.orderId, orderIds))
      : [],
  ]);

  // Browsers getting push updates about the account, its quotes or orders.
  // Only the push service's host is shown: the endpoint and keys are secrets.
  const pushRows = await db
    .select({
      kind: pushTopics.kind,
      endpoint: pushSubscriptions.endpoint,
      createdAt: pushTopics.createdAt,
      lastSentAt: pushSubscriptions.lastSentAt,
    })
    .from(pushTopics)
    .innerJoin(pushSubscriptions, eq(pushTopics.subscriptionId, pushSubscriptions.id))
    .where(pushTopicsForCustomer(customerId))
    .orderBy(asc(pushTopics.createdAt));

  return {
    exportedAt: new Date().toISOString(),
    controller: "RefurbednUsed",
    note: "Bank details are shown masked. Ask us if you need a full copy of anything here.",
    profile,
    addresses,
    payoutAccount: payoutAccount[0] ?? null,
    signInMethods: [
      ...signInMethods.map((m) => m.provider),
      ...passkeys.map((p) => `passkey (${p.deviceType}${p.backedUp ? ", synced" : ""})`),
    ],
    tradeIns: quoteRows.map(({ id, ...q }) => ({
      ...q,
      inspections: inspectionRows.filter((i) => i.quoteId === id).map((i) => without(i, "quoteId")),
      payouts: payoutRows.filter((p) => p.quoteReference === q.reference),
    })),
    orders: orderRows.map(({ id, ...o }) => ({
      ...o,
      items: itemRows.filter((i) => i.orderId === id).map((i) => without(i, "orderId")),
      payments: paymentRows.filter((p) => p.orderId === id).map((p) => without(p, "orderId")),
      returnsAndWarranty: requestRows
        .filter((r) => r.orderId === id)
        .map((r) => without(r, "orderId")),
    })),
    priceAlerts: priceAlertRows,
    stockAlerts: stockAlertRows,
    pushNotifications: pushRows.map(({ endpoint, ...row }) => ({
      ...row,
      pushService: new URL(endpoint).hostname,
    })),
    reviews: reviewRows,
    activity,
  };
}

/** Push topics about the customer: their price alerts, quotes and orders. */
function pushTopicsForCustomer(customerId: string) {
  return or(
    eq(pushTopics.customerId, customerId),
    inArray(
      pushTopics.quoteId,
      sql`(select ${quotes.id} from ${quotes} where ${quotes.customerId} = ${customerId})`,
    ),
    inArray(
      pushTopics.orderId,
      sql`(select ${orders.id} from ${orders} where ${orders.customerId} = ${customerId})`,
    ),
  );
}

// Erasure -----------------------------------------------------------------------

export type DeletionBlocker =
  "trade_in_in_progress" | "order_in_progress" | "open_return_or_claim" | "payout_pending";

/** Things that must finish before an account can be erased. */
export async function deletionBlockers(db: AppDb, customerId: string): Promise<DeletionBlocker[]> {
  const [openQuotes, openOrders, openRequests, pendingPayouts] = await Promise.all([
    db
      .select({ id: quotes.id })
      .from(quotes)
      .where(
        and(
          eq(quotes.customerId, customerId),
          inArray(quotes.status, ["accepted", "received", "inspecting", "revised", "approved"]),
        ),
      )
      .limit(1),
    db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.customerId, customerId),
          inArray(orders.status, ["paid", "processing", "dispatched", "ready_for_collection"]),
        ),
      )
      .limit(1),
    db
      .select({ id: orderRequests.id })
      .from(orderRequests)
      .innerJoin(orders, eq(orderRequests.orderId, orders.id))
      .where(
        and(
          eq(orders.customerId, customerId),
          inArray(orderRequests.status, ["submitted", "approved"]),
        ),
      )
      .limit(1),
    db
      .select({ id: payouts.id })
      .from(payouts)
      .where(
        and(eq(payouts.customerId, customerId), inArray(payouts.status, ["pending", "processing"])),
      )
      .limit(1),
  ]);
  const blockers: DeletionBlocker[] = [];
  if (openQuotes.length) blockers.push("trade_in_in_progress");
  if (openOrders.length) blockers.push("order_in_progress");
  if (openRequests.length) blockers.push("open_return_or_claim");
  if (pendingPayouts.length) blockers.push("payout_pending");
  return blockers;
}

export function redactedEmail(customerId: string) {
  return `deleted-${customerId}@deleted.invalid`;
}

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; reason: Exclude<CodeCheck, "ok"> }
  | { ok: false; reason: "blocked"; blockers: DeletionBlocker[] };

/** Erases the customer after checking the emailed code and that nothing is in progress. */
export async function deleteCustomerAccount(
  db: AppDb,
  input: { customerId: string; code: string },
  options: { now?: Date; meta?: RequestMeta } = {},
): Promise<DeleteAccountResult> {
  const now = options.now ?? new Date();
  const check = await verifyCode(db, input.customerId, "delete_account", input.code, now);
  if (check !== "ok") return { ok: false, reason: check };
  const blockers = await deletionBlockers(db, input.customerId);
  if (blockers.length) return { ok: false, reason: "blocked", blockers };

  const id = input.customerId;
  const email = redactedEmail(id);
  await db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const [customer] = await tx
      .select({ email: customers.email })
      .from(customers)
      .where(eq(customers.id, id))
      .for("update");
    if (!customer) return;
    const oldEmail = customer.email.toLowerCase();

    // Delete what we don't need to keep.
    await tx.delete(customerAddresses).where(eq(customerAddresses.customerId, id));
    await tx.delete(customerPayoutAccounts).where(eq(customerPayoutAccounts.customerId, id));
    await tx.delete(customerVerificationCodes).where(eq(customerVerificationCodes.customerId, id));
    await tx.delete(priceAlerts).where(eq(priceAlerts.customerId, id));
    await tx.delete(pushTopics).where(pushTopicsForCustomer(id));
    await deleteIdlePushSubscriptions(tx);
    await tx
      .delete(stockAlerts)
      .where(or(eq(stockAlerts.customerId, id), eq(stockAlerts.email, oldEmail)));
    // Signs them out everywhere and removes Google links and passkeys.
    await tx.delete(customerSessions).where(eq(customerSessions.userId, id));
    await tx.delete(customerAccounts).where(eq(customerAccounts.userId, id));
    await tx.delete(customerAuthenticators).where(eq(customerAuthenticators.userId, id));

    // Anonymise what the law makes us keep.
    await tx
      .update(orders)
      .set({
        email,
        contactName: null,
        contactPhone: null,
        accessTokenHash: null,
        accessTokenEncrypted: null,
        shippingAddress: sql`case when ${orders.shippingAddress} is null then null else json_object('name', 'Deleted', 'line1', 'Deleted', 'town', 'Deleted', 'postcode', 'Deleted', 'country', 'GB') end`,
      })
      .where(eq(orders.customerId, id));
    await tx
      .update(quotes)
      .set({
        contactName: null,
        contactEmail: email,
        contactPhone: null,
        contactAddress: null,
        trackingTokenHash: null,
      })
      .where(eq(quotes.customerId, id));
    await tx
      .update(reviews)
      .set({ displayName: "Former customer", customerId: null })
      .where(eq(reviews.customerId, id));
    await tx
      .update(customers)
      .set({
        email,
        name: null,
        phone: null,
        image: null,
        emailVerified: null,
        marketingOptIn: false,
        marketingSmsOptIn: false,
        marketingUpdatedAt: now,
        deletedAt: now,
      })
      .where(eq(customers.id, id));
    // No personal data in the entry: just that it happened.
    await recordAudit(tx, {
      actorType: "customer",
      actorId: id,
      action: "customer.erased",
      entityType: "customer",
      entityId: id,
      changes: { after: { erasedAt: now.toISOString() } },
    });
  });
  // Trimmed audit metadata: IPs and user agents on this customer's entries.
  await db
    .update(auditLog)
    .set({ ipAddress: null, userAgent: null })
    .where(
      and(
        or(
          and(eq(auditLog.actorType, "customer"), eq(auditLog.actorId, id)),
          and(eq(auditLog.entityType, "customer"), eq(auditLog.entityId, id)),
        ),
        isNotNull(auditLog.ipAddress),
      ),
    );
  return { ok: true };
}
