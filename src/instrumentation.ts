import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/lib/observability/sentry-options";

/** Server and edge error reporting. Off unless NEXT_PUBLIC_SENTRY_DSN is set. */
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    ...sentryOptions(dsn),
    // Local variables can hold personal data and secrets.
    includeLocalVariables: false,
  });
}

/** Errors from Server Components, Server Actions, route handlers and the proxy. */
export const onRequestError = Sentry.captureRequestError;
