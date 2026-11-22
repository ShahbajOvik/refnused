import type { Breadcrumb, ErrorEvent, Event } from "@sentry/nextjs";

/*
 * Removes personal data and secrets from Sentry events before they leave
 * the server or browser. Pure; used as beforeSend / beforeSendTransaction /
 * beforeBreadcrumb (src/lib/observability/sentry-options.ts). Tested in
 * scrub.test.ts.
 *
 * Two layers:
 * - Fields whose names mean personal data or secrets (in request bodies,
 *   extra data and breadcrumb data) are replaced outright.
 * - Every string is also passed through patterns for emails, UK phone
 *   numbers and postcodes, IMEIs, card and bank numbers, API keys, and the
 *   secret tokens in our quote, order and alert links.
 * The user, cookies and most headers are dropped entirely.
 */

export const FILTERED = "[Filtered]";

const SENSITIVE_KEY =
  /pass(word|code)?|secret|token|auth|cookie|session|csrf|otp|totp|sort.?code|account.?(number|no)|iban|bank|card|cvc|cvv|email|phone|mobile|postcode|post.?code|address|line1|line2|imei|serial|contact.?name|holder|full.?name|first.?name|last.?name|dob|birth|ip.?address|signature|private|api.?key/i;

/** Headers worth keeping: nothing that identifies or authenticates someone. */
const SAFE_HEADERS = new Set([
  "accept",
  "accept-language",
  "content-type",
  "user-agent",
  "next-router-prefetch",
  "rsc",
]);

const PATTERNS: [RegExp, string][] = [
  // Our secret links: /sell/track/<token>, /orders/<token>, /shop/alerts/<token>.
  [/(\/(?:sell\/track|orders|shop\/alerts)\/)[A-Za-z0-9_-]{8,}/g, "$1[token]"],
  // Secrets in query strings.
  [
    /([?&](?:token|code|secret|signature|key|email|callbackUrl|redirect_status|payment_intent_client_secret|client_secret)=)[^&#\s]*/gi,
    "$1[Filtered]",
  ],
  // Keys: Stripe, webhook secrets, bearer tokens, JWTs.
  [/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}/g, "[secret]"],
  [/\bwhsec_[A-Za-z0-9]{8,}/g, "[secret]"],
  [/\bpi_[A-Za-z0-9]{8,}_secret_[A-Za-z0-9]+/g, "[secret]"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [secret]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[jwt]"],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]"],
  [/\b\d{15}\b/g, "[imei]"],
  // Card numbers (13–19 digits, optional spaces/dashes), before shorter numbers.
  [/\b(?:\d[ -]?){12,18}\d\b/g, "[number]"],
  // UK phone numbers: +44 or 0, then 9–10 more digits.
  [/(?:\+44\s?\(?0?\)?\s?|\b0)\d(?:[\s-]?\d){8,9}\b/g, "[phone]"],
  [/\b\d{2}-\d{2}-\d{2}\b/g, "[sort-code]"],
  [/\b\d{8}\b/g, "[number]"],
  // UK postcodes.
  [/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, "[postcode]"],
];

export function scrubString(value: string): string {
  let out = value;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

/** Deep copy with sensitive keys filtered and every string scrubbed. */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return FILTERED;
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, v]) => [
        key,
        SENSITIVE_KEY.test(key) ? FILTERED : scrubValue(v, depth + 1),
      ]),
    );
  }
  return value;
}

/** Strings only (keys like "name" in contexts.os are fine). */
function scrubStrings(value: unknown, depth = 0): unknown {
  if (depth > 8) return value;
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map((v) => scrubStrings(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        scrubStrings(v, depth + 1),
      ]),
    );
  }
  return value;
}

export function scrubEvent<T extends Event | ErrorEvent>(event: T): T {
  const e = { ...event };
  delete e.user;
  delete e.server_name;
  if (e.message) e.message = scrubString(e.message);
  if (e.request) {
    const headers = Object.fromEntries(
      Object.entries(e.request.headers ?? {})
        .filter(([name]) => SAFE_HEADERS.has(name.toLowerCase()))
        .map(([name, value]) => [name, scrubString(String(value))]),
    );
    e.request = {
      method: e.request.method,
      url: e.request.url ? scrubString(e.request.url) : undefined,
      query_string:
        typeof e.request.query_string === "string"
          ? scrubString(`?${e.request.query_string}`).slice(1)
          : undefined,
      headers,
      data: e.request.data === undefined ? undefined : scrubValue(e.request.data),
    };
  }
  if (e.exception?.values) {
    e.exception = {
      ...e.exception,
      values: e.exception.values.map((ex) => ({
        ...ex,
        value: ex.value ? scrubString(ex.value) : ex.value,
        // Local variables can hold anything: never send them.
        stacktrace: ex.stacktrace && {
          ...ex.stacktrace,
          frames: ex.stacktrace.frames?.map((frame) => {
            const copy = { ...frame };
            delete copy.vars;
            return copy;
          }),
        },
      })),
    };
  }
  if (e.extra) e.extra = scrubValue(e.extra) as T["extra"];
  if (e.contexts) e.contexts = scrubStrings(e.contexts) as T["contexts"];
  if (e.tags) e.tags = scrubStrings(e.tags) as T["tags"];
  if (e.transaction) e.transaction = scrubString(e.transaction);
  if (e.breadcrumbs) {
    e.breadcrumbs = e.breadcrumbs.map(scrubBreadcrumb).filter((b): b is Breadcrumb => b !== null);
  }
  return e;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  // Console output can contain anything we logged; keep only errors' text.
  if (breadcrumb.category === "console" && breadcrumb.level !== "error") return null;
  return {
    ...breadcrumb,
    message: breadcrumb.message ? scrubString(breadcrumb.message) : breadcrumb.message,
    data: breadcrumb.data ? (scrubValue(breadcrumb.data) as Breadcrumb["data"]) : breadcrumb.data,
  };
}
