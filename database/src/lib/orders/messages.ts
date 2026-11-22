import { siteConfig } from "../../config/site";
import { formatDate, formatPrice } from "../format";

import { RETURN_WINDOW_DAYS } from "./requests";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export type OrderMessageInput = {
  name: string;
  orderNumber: string;
  items: { description: string; unitPricePence: number }[];
  subtotalPence: number;
  deliveryPence: number;
  tradeInCreditPence: number;
  totalPence: number;
  fulfilment:
    | { method: "delivery"; label: string; address: string }
    | { method: "click_and_collect"; storeName: string; storeTown?: string; storeAddress: string };
  orderUrl: string;
};

function fulfilmentLine(f: OrderMessageInput["fulfilment"]) {
  return f.method === "delivery"
    ? `${f.label} to ${f.address}. We’ll email you when it’s on its way.`
    : `Click and collect from ${f.storeName}, ${f.storeAddress}. We’ll text you when it’s ready. Bring photo ID.`;
}

/** Order confirmation, sent once the payment webhook has marked the order paid. */
export function orderConfirmationEmail(o: OrderMessageInput) {
  const subject = `Order ${o.orderNumber} confirmed: thank you`;
  const rows: [string, string][] = [
    ...o.items.map((i) => [i.description, formatPrice(i.unitPricePence)] as [string, string]),
    ["Delivery", o.deliveryPence ? formatPrice(o.deliveryPence) : "Free"],
    ...(o.tradeInCreditPence
      ? [["Trade-in credit", `−${formatPrice(o.tradeInCreditPence)}`] as [string, string]]
      : []),
    ["Total paid", formatPrice(o.totalPence)],
  ];
  const text = [
    `Hi ${o.name},`,
    "",
    `Thanks for your order. It’s confirmed and paid.`,
    "",
    `Order number: ${o.orderNumber}`,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    fulfilmentLine(o.fulfilment),
    "",
    `View your order, or request a return within ${RETURN_WINDOW_DAYS} days: ${o.orderUrl}`,
    "Keep this email: the link is how you manage your order.",
  ].join("\n");
  const html = `<!doctype html><html lang="en-GB"><body style="margin:0;padding:24px;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#1d232b">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px"><tr><td>
<p style="margin:0 0 16px;font-size:20px;font-weight:bold">Order ${escapeHtml(o.orderNumber)} confirmed</p>
<p style="margin:0 0 16px">Hi ${escapeHtml(o.name)}, thanks for your order. It’s confirmed and paid.</p>
<table role="presentation" style="width:100%;margin:0 0 16px;border-collapse:collapse;font-size:15px">
${rows
  .map(
    ([k, v], i) =>
      `<tr><td style="padding:6px 0;${i === rows.length - 1 ? "font-weight:bold;border-top:1px solid #e3e5e8" : ""}">${escapeHtml(k)}</td><td style="padding:6px 0;text-align:right;${i === rows.length - 1 ? "font-weight:bold;border-top:1px solid #e3e5e8" : ""}">${escapeHtml(v)}</td></tr>`,
  )
  .join("\n")}
</table>
<p style="margin:0 0 16px">${escapeHtml(fulfilmentLine(o.fulfilment))}</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(o.orderUrl)}" style="display:inline-block;background:#0f7a55;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">View your order</a></p>
<p style="margin:0;color:#5b6470;font-size:13px">Changed your mind? You can request a return within ${RETURN_WINDOW_DAYS} days from your order page. Keep this email: the link is how you manage your order.</p>
</td></tr></table></body></html>`;
  return { subject, text, html };
}

export function orderConfirmationSms(
  o: Pick<OrderMessageInput, "orderNumber" | "totalPence" | "fulfilment" | "orderUrl">,
) {
  const how =
    o.fulfilment.method === "delivery"
      ? "We’ll email you when it’s on its way."
      : `We’ll text you when it’s ready to collect from ${o.fulfilment.storeName}${o.fulfilment.storeTown ? `, ${o.fulfilment.storeTown}` : ""}.`;
  return `${siteConfig.name}: order ${o.orderNumber} confirmed (${formatPrice(o.totalPence)} paid). ${how} ${o.orderUrl}`;
}

export function orderRequestEmail(r: {
  name: string;
  orderNumber: string;
  reference: string;
  type: "return" | "warranty";
  item: string;
  deadline: Date;
  orderUrl: string;
}) {
  const what = r.type === "return" ? "return request" : "warranty claim";
  const subject = `We’ve got your ${what} ${r.reference}`;
  const next =
    r.type === "return"
      ? "We’ll email you a free returns label within 1 working day, or you can bring it to any of our stores. Your refund is paid once we receive the phone."
      : `We’ll be in touch within 2 working days to arrange a repair or replacement. Your warranty runs until ${formatDate(r.deadline)}.`;
  const text = [
    `Hi ${r.name},`,
    "",
    `We’ve received your ${what} for ${r.item} (order ${r.orderNumber}).`,
    `Reference: ${r.reference}`,
    "",
    next,
    "",
    `Your order: ${r.orderUrl}`,
  ].join("\n");
  const html = `<p>Hi ${escapeHtml(r.name)},</p><p>We’ve received your ${what} for <strong>${escapeHtml(r.item)}</strong> (order ${escapeHtml(r.orderNumber)}).</p><p>Reference: <strong>${escapeHtml(r.reference)}</strong></p><p>${escapeHtml(next)}</p><p><a href="${escapeHtml(r.orderUrl)}">View your order</a></p>`;
  return { subject, text, html };
}
