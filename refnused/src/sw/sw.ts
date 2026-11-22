/// <reference lib="webworker" />
/*
 * The service worker. Built after `next build` by scripts/build-sw.mts into
 * public/sw.js (not committed). Type-checked with src/sw/tsconfig.json.
 *
 * - Precaches the app shell: the offline page and the CSS, fonts and
 *   scripts it needs, plus the icons (list made at build time).
 * - Runtime caching follows src/lib/pwa/cache-rules.ts.
 * - Offline navigations that miss the cache get /offline (store details).
 * - Waits for the page to say SKIP_WAITING, so the update toast decides
 *   when a new version takes over (src/components/pwa/pwa-register.tsx).
 * - Shows Web Push notifications and opens their page when tapped.
 */
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  type PrecacheEntry,
  type RuntimeCaching,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

import { cacheRuleFor, type CacheRule } from "../lib/pwa/cache-rules";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

/** Filled in by scripts/build-sw.mts. */
declare const __IMAGE_ORIGINS__: string[];

export const OFFLINE_URL = "/offline";
const DAY = 24 * 60 * 60;

const ok = new CacheableResponsePlugin({ statuses: [200] });

const strategies: Record<CacheRule, RuntimeCaching["handler"]> = {
  "network-only": new NetworkOnly(),
  "page-swr": new StaleWhileRevalidate({
    cacheName: "pages-products-models",
    plugins: [ok, new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 7 * DAY })],
  }),
  "image-swr": new StaleWhileRevalidate({
    cacheName: "images",
    // 0: opaque cross-origin images (R2, Sanity) when loaded without CORS.
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * DAY, purgeOnQuotaError: true }),
    ],
  }),
  static: new CacheFirst({
    cacheName: "next-static",
    plugins: [ok, new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * DAY })],
  }),
  "page-network-first": new NetworkFirst({
    cacheName: "pages",
    networkTimeoutSeconds: 4,
    plugins: [ok, new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 7 * DAY })],
  }),
};

/*
 * GET only. POST/PUT/PATCH/DELETE (Server Actions, forms, mutating API
 * calls) are never handled here, so they always go straight to the network.
 */
const runtimeCaching: RuntimeCaching[] = (Object.keys(strategies) as CacheRule[]).map((rule) => ({
  matcher: ({ request, url }) =>
    cacheRuleFor({
      method: request.method,
      url,
      origin: self.location.origin,
      destination: request.destination,
      imageOrigins: __IMAGE_ORIGINS__,
    }) === rule &&
    // Network-only requests are only handled for page loads (so they can
    // fall back to /offline). API calls and RSC requests go straight to the
    // network without passing through the worker.
    (rule !== "network-only" || request.mode === "navigate"),
  handler: strategies[rule],
}));

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanupOutdatedCaches: true },
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  disableDevLogs: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: OFFLINE_URL,
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

// Web Push ----------------------------------------------------------------------

type PushMessage = { title: string; body: string; url: string; tag: string };

function parsePush(event: PushEvent): PushMessage | null {
  try {
    const data = event.data?.json() as Partial<PushMessage> | undefined;
    if (!data?.title || typeof data.title !== "string") return null;
    return {
      title: data.title,
      body: typeof data.body === "string" ? data.body : "",
      url: typeof data.url === "string" ? data.url : "/",
      tag: typeof data.tag === "string" ? data.tag : "refurbednused",
    };
  } catch {
    return null;
  }
}

self.addEventListener("push", (event) => {
  const message = parsePush(event);
  if (!message) return;
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      lang: "en-GB",
      data: { url: message.url },
    }),
  );
});

/** Only open pages on this site. */
function sameOriginUrl(raw: unknown): string {
  try {
    const url = new URL(typeof raw === "string" ? raw : "/", self.location.origin);
    return url.origin === self.location.origin ? url.href : self.location.origin;
  } catch {
    return self.location.origin;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = sameOriginUrl((event.notification.data as { url?: unknown } | null)?.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((c) => c.url === target) ?? windows[0];
      if (existing) {
        const focused = await existing.focus();
        if (focused.url !== target) await focused.navigate(target).catch(() => null);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// The browser replaced the subscription: tell the server so updates keep coming.
self.addEventListener("pushsubscriptionchange", ((event: Event) => {
  const change = event as Event & {
    oldSubscription?: PushSubscription | null;
    newSubscription?: PushSubscription | null;
    waitUntil(promise: Promise<unknown>): void;
  };
  const old = change.oldSubscription;
  if (!old) return;
  change.waitUntil(
    (async () => {
      const next =
        change.newSubscription ??
        (await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: old.options.applicationServerKey,
        }));
      await fetch("/api/push/subscription-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldEndpoint: old.endpoint, subscription: next.toJSON() }),
      });
    })().catch(() => undefined),
  );
}) as EventListener);
