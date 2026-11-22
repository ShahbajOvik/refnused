import { siteConfig } from "../../config/site";
import { formatPrice } from "../format";

/*
 * Push notification wording. Notifications can show on a locked screen, so
 * they never include names, addresses, contact details or payout amounts:
 * just enough to know what changed, and a link to the page with the detail.
 */

export type PushPayload = {
  title: string;
  body: string;
  /** Same-origin path to open when the notification is tapped. */
  url: string;
  /** Replaces an earlier notification with the same tag. */
  tag: string;
};

export type QuotePushEvent = "received" | "revised" | "approved" | "rejected" | "paid" | "returned";

export function quotePush(
  event: QuotePushEvent,
  quote: { reference: string; device: string; path: string },
): PushPayload {
  const text: Record<QuotePushEvent, [string, string]> = {
    received: [
      "We’ve received your phone",
      `Your ${quote.device} has arrived. We’ll check it soon.`,
    ],
    revised: [
      "Your offer has been revised",
      `We’ve checked your ${quote.device}. Please accept or decline the new offer.`,
    ],
    approved: [
      "Your trade-in is approved",
      `Your ${quote.device} passed our checks. We’re sending your payment.`,
    ],
    rejected: [
      "We can’t accept your phone",
      `We couldn’t accept your ${quote.device}. See your quote for what happens next.`,
    ],
    paid: ["You’ve been paid", `We’ve paid you for your ${quote.device}.`],
    returned: ["Your phone is on its way back", `We’ve sent your ${quote.device} back to you.`],
  };
  const [title, body] = text[event];
  return {
    title,
    body: `${body} Ref ${quote.reference}.`,
    url: quote.path,
    tag: `quote:${quote.reference}`,
  };
}

export type OrderPushEvent = "paid" | "dispatched" | "ready" | "request_decided";

export function orderPush(
  event: OrderPushEvent,
  order: { orderNumber: string; path: string; store?: string },
): PushPayload {
  const text: Record<OrderPushEvent, [string, string]> = {
    paid: ["Order confirmed", `Thanks, order ${order.orderNumber} is paid and confirmed.`],
    dispatched: ["Your order is on its way", `Order ${order.orderNumber} has been dispatched.`],
    ready: [
      "Ready to collect",
      `Order ${order.orderNumber} is ready${order.store ? ` at ${order.store}` : ""}. Bring photo ID.`,
    ],
    request_decided: [
      "Update on your request",
      `We’ve replied to your return or warranty request for order ${order.orderNumber}.`,
    ],
  };
  const [title, body] = text[event];
  return { title, body, url: order.path, tag: `order:${order.orderNumber}` };
}

export function priceAlertPush(alert: {
  id: string;
  type: "shop" | "trade_in";
  model: string;
  pricePence: number;
  path: string;
}): PushPayload {
  const price = formatPrice(alert.pricePence);
  return alert.type === "shop"
    ? {
        title: "Price alert: price drop",
        body: `A refurbished ${alert.model} is now ${price} at ${siteConfig.name}.`,
        url: alert.path,
        tag: `price-alert:${alert.id}`,
      }
    : {
        title: "Price alert: trade-in offer up",
        body: `We now pay up to ${price} for the ${alert.model}. Get your quote.`,
        url: alert.path,
        tag: `price-alert:${alert.id}`,
      };
}
