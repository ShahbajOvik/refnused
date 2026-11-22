import { scrubBreadcrumb, scrubEvent } from "./scrub";

/*
 * Sentry settings shared by the server (src/instrumentation.ts) and the
 * browser (src/instrumentation-client.ts). Privacy first:
 * - sendDefaultPii off: no IP addresses, cookies or user details;
 * - every event, transaction and breadcrumb goes through scrub.ts;
 * - no performance tracing or session replay (nothing recorded beyond errors).
 */
export function sentryOptions(dsn: string) {
  return {
    dsn,
    environment:
      process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 30,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
