/**
 * en-GB display formatting. Display only: never use these for calculations.
 * Money is stored and calculated on the server as integer pence.
 */

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

const gbpWhole = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Formats integer pence as GBP, e.g. 129900 → "£1,299.00". */
export function formatPrice(pence: number, options?: { whole?: boolean }): string {
  if (!Number.isInteger(pence)) {
    throw new TypeError(`formatPrice expects integer pence, received ${pence}`);
  }
  const pounds = pence / 100;
  return options?.whole && pence % 100 === 0 ? gbpWhole.format(pounds) : gbp.format(pounds);
}

const dateShort = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/London",
});

const dateLong = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/London",
});

/** "17/11/2026" (short) or "17 November 2026" (long), in UK time. */
export function formatDate(date: Date, style: "short" | "long" = "long"): string {
  return (style === "short" ? dateShort : dateLong).format(date);
}

/** Builds a tel: href from an E.164 number. */
export function telHref(e164: string): string {
  return `tel:${e164.replace(/[^+\d]/g, "")}`;
}
