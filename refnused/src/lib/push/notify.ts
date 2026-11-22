import "server-only";

import { db } from "@/db";
import { quoteContact } from "@/lib/admin/quotes";
import { getOrderById } from "@/lib/orders/order-service";
import { storeName } from "@/lib/stores";

import { orderPush, quotePush, type OrderPushEvent, type QuotePushEvent } from "./messages";
import { pushToTarget } from "./send";

/*
 * Push updates alongside the existing emails and texts. Call these from
 * `after()` so the push services never slow down the response. None throw.
 */

export async function pushQuoteUpdate(quoteId: string, event: QuotePushEvent) {
  const quote = await quoteContact(db, quoteId).catch(() => null);
  if (!quote) return;
  await pushToTarget({ kind: "quote", quoteId }, (path) =>
    path ? quotePush(event, { reference: quote.reference, device: quote.device, path }) : null,
  );
}

export async function pushOrderUpdate(orderId: string, event: OrderPushEvent) {
  const order = await getOrderById(db, orderId).catch(() => null);
  if (!order) return;
  const store = order.collectionStore
    ? storeName({ name: order.collectionStore.name, address: { town: order.collectionStore.town } })
    : undefined;
  await pushToTarget({ kind: "order", orderId }, (path) =>
    path ? orderPush(event, { orderNumber: order.orderNumber, path, store }) : null,
  );
}
