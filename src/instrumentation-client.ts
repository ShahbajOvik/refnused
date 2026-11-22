/*
 * Browser error reporting, off unless NEXT_PUBLIC_SENTRY_DSN is set. The SDK
 * is loaded once the page is idle, so it isn't part of the initial
 * JavaScript (budget: 200KB). Errors in the first moments of a visit aren't
 * reported; server errors always are (src/instrumentation.ts).
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn && typeof window !== "undefined") {
  const start = () => {
    void import("@/lib/observability/sentry-client").then((m) => m.initSentryClient(dsn));
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(start, { timeout: 5000 });
  else setTimeout(start, 3000);
}
