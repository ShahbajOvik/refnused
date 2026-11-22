import { siteConfig } from "@/config/site";
import { formatPrice } from "@/lib/format";

/* Customer emails sent from admin actions. Plain text plus simple HTML. */

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function email(subject: string, paragraphs: string[], link?: { url: string; label: string }) {
  const text = [...paragraphs, ...(link ? ["", `${link.label}: ${link.url}`] : [])].join("\n\n");
  const html = `${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}${
    link ? `<p><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></p>` : ""
  }`;
  return { subject, text, html };
}

export function revisedOfferEmail(input: {
  name: string;
  reference: string;
  device: string;
  offeredPence: number;
  revisedPence: number;
  reason: string | null;
  accountUrl: string;
}) {
  return email(
    `Your trade-in ${input.reference}: we’ve revised our offer`,
    [
      `Hi ${input.name},`,
      `We’ve checked your ${input.device}. It wasn’t quite as described${input.reason ? `: ${input.reason}` : "."}`,
      `Our new offer is ${formatPrice(input.revisedPence)} (it was ${formatPrice(input.offeredPence)}). You can accept it, or we’ll send your phone back free of charge.`,
    ],
    { url: input.accountUrl, label: "Accept or decline the new offer" },
  );
}

export function quoteRejectedEmail(input: { name: string; reference: string; device: string }) {
  return email(`Your trade-in ${input.reference}: we can’t accept this phone`, [
    `Hi ${input.name},`,
    `We’re sorry, we can’t buy your ${input.device}. It didn’t pass our CheckMEND check, which looks for phones reported lost, stolen, blocked or still on finance.`,
    `We’ll be in touch about what happens next. If you think this is a mistake, reply to this email.`,
  ]);
}

export function quoteApprovedEmail(input: {
  name: string;
  reference: string;
  amountPence: number;
}) {
  return email(`Your trade-in ${input.reference} has passed our checks`, [
    `Hi ${input.name},`,
    `Good news: your phone passed our checks. We’ll pay ${formatPrice(input.amountPence)} to your bank account shortly.`,
  ]);
}

export function payoutPaidEmail(input: {
  name: string;
  reference: string;
  amountPence: number;
  last4: string | null;
}) {
  return email(`We’ve paid you ${formatPrice(input.amountPence)}`, [
    `Hi ${input.name},`,
    `We’ve sent ${formatPrice(input.amountPence)} for trade-in ${input.reference}${
      input.last4 ? ` to your account ending ${input.last4}` : ""
    }. It usually arrives within 2 hours, but can take up to 1 working day.`,
    `Thanks for selling with ${siteConfig.name}.`,
  ]);
}

export function orderDispatchedEmail(input: {
  name: string;
  orderNumber: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string | null;
}) {
  return email(
    `Order ${input.orderNumber} is on its way`,
    [
      `Hi ${input.name},`,
      `Your order has been dispatched with ${input.carrier}. Tracking number: ${input.trackingNumber}.`,
    ],
    input.trackingUrl ? { url: input.trackingUrl, label: "Track your parcel" } : undefined,
  );
}

export function orderReadyEmail(input: { name: string; orderNumber: string; store: string }) {
  return email(`Order ${input.orderNumber} is ready to collect`, [
    `Hi ${input.name},`,
    `Your order is ready to collect from ${input.store}. Bring photo ID and your order number.`,
  ]);
}

export function requestDecisionEmail(input: {
  name: string;
  reference: string;
  type: "return" | "warranty";
  decision: "approved" | "rejected" | "completed";
  note: string | null;
}) {
  const what = input.type === "return" ? "return" : "warranty claim";
  const body = {
    approved:
      input.type === "return"
        ? "We’ve approved your return. We’ll email you a free returns label, or you can bring it to any of our stores."
        : "We’ve approved your warranty claim. We’ll contact you to arrange the repair or replacement.",
    rejected: `We’re sorry, we can’t accept this ${what}.`,
    completed:
      input.type === "return"
        ? "Your return is complete. Any refund goes back to your original payment method within 5–10 working days."
        : "Your warranty claim is complete.",
  }[input.decision];
  return email(`Your ${what} ${input.reference}`, [
    `Hi ${input.name},`,
    body,
    ...(input.note ? [`Note from our team: ${input.note}`] : []),
  ]);
}
