import { siteConfig } from "@refnused/database/config/site";
import { formatDate, formatPrice } from "@refnused/database/lib/format";

export type QuoteMessageInput = {
  name: string;
  reference: string;
  device: string;
  offerPence: number;
  priceLockedUntil: Date;
  delivery:
    | { method: "postage_pack" }
    | { method: "print_label" }
    | { method: "store_drop_off"; storeName: string; storeAddress: string };
  trackingUrl: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function nextStep(d: QuoteMessageInput["delivery"]) {
  switch (d.method) {
    case "postage_pack":
      return "We’ll post you a free pack. Put your phone in it and send it back.";
    case "print_label":
      return "Print your label from your tracking page, pack your phone securely and post it.";
    case "store_drop_off":
      return `Bring your phone to ${d.storeName}, ${d.storeAddress}, and quote your reference.`;
  }
}

/** Confirmation email: plain text and HTML. */
export function quoteConfirmationEmail(q: QuoteMessageInput) {
  const offer = formatPrice(q.offerPence);
  const lock = formatDate(q.priceLockedUntil);
  const subject = `Your ${siteConfig.name} quote ${q.reference}: ${offer}`;
  const lines = [
    `Hi ${q.name},`,
    "",
    `Thanks for choosing ${siteConfig.name}. Here’s your quote.`,
    "",
    `Reference: ${q.reference}`,
    `Phone: ${q.device}`,
    `Our offer: ${offer}`,
    `Price locked until: ${lock}`,
    "",
    `What to do next: ${nextStep(q.delivery)}`,
    "",
    "Before you send it: back up your phone, sign out of iCloud or your Google account, and reset it.",
    "",
    `Track your trade-in: ${q.trackingUrl}`,
    "",
    "We check every phone when it arrives. If its condition is different from your answers, we’ll send you a revised offer to accept or decline.",
  ];
  const text = lines.join("\n");
  const html = `<!doctype html><html lang="en-GB"><body style="margin:0;padding:24px;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#1d232b">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px"><tr><td>
<p style="margin:0 0 16px;font-size:20px;font-weight:bold">Your quote ${escapeHtml(q.reference)}</p>
<p style="margin:0 0 16px">Hi ${escapeHtml(q.name)}, thanks for choosing ${siteConfig.name}.</p>
<table role="presentation" style="width:100%;margin:0 0 16px;border-collapse:collapse;font-size:15px">
<tr><td style="padding:6px 0;color:#5b6470">Phone</td><td style="padding:6px 0;text-align:right">${escapeHtml(q.device)}</td></tr>
<tr><td style="padding:6px 0;color:#5b6470">Our offer</td><td style="padding:6px 0;text-align:right;font-size:20px;font-weight:bold">${offer}</td></tr>
<tr><td style="padding:6px 0;color:#5b6470">Price locked until</td><td style="padding:6px 0;text-align:right">${lock}</td></tr>
</table>
<p style="margin:0 0 16px"><strong>What to do next:</strong> ${escapeHtml(nextStep(q.delivery))}</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(q.trackingUrl)}" style="display:inline-block;background:#0f7a63;color:#fff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:8px">Track your trade-in</a></p>
<p style="margin:0;font-size:14px;color:#5b6470">Before you send it: back up your phone, sign out of iCloud or your Google account, and reset it.</p>
</td></tr></table></body></html>`;
  return { subject, text, html };
}

/** Short confirmation SMS (fits in two segments). */
export function quoteConfirmationSms(q: QuoteMessageInput) {
  return `${siteConfig.name}: quote ${q.reference} for your ${q.device}: ${formatPrice(q.offerPence)}, locked until ${formatDate(q.priceLockedUntil, "short")}. Track it: ${q.trackingUrl}`;
}
