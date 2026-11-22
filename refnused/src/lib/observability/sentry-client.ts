import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "./sentry-options";

/** Loaded lazily by src/instrumentation-client.ts. Errors only: no tracing or replay. */
export function initSentryClient(dsn: string) {
  Sentry.init({
    ...sentryOptions(dsn),
    integrations: (defaults) =>
      defaults.filter((i) => !["BrowserTracing", "Replay", "Feedback"].includes(i.name)),
  });
}
