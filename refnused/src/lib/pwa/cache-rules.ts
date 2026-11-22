/*
 * How the service worker (src/sw/sw.ts) treats each request. Pure, so the
 * rules are unit-tested; the worker only wires them to Serwist strategies.
 *
 * - network-only: anything personal or changing data. Never cached, so a
 *   basket, checkout, account, order, admin page or API response can't be
 *   shown to someone else on a shared device, or shown stale.
 * - page-swr: product and model pages (HTML and RSC payloads). Shown from
 *   the cache straight away, refreshed in the background. Prices and stock
 *   are always re-checked on the server at basket and checkout.
 * - image-swr: product photos, optimised images and guide images.
 * - static: hashed build assets (immutable).
 * - page-network-first: other public pages, so the last version seen still
 *   opens offline.
 */

export type CacheRule = "network-only" | "page-swr" | "image-swr" | "static" | "page-network-first";

/** Personal or private areas: always straight to the network. */
export const NETWORK_ONLY_PREFIXES = [
  "/basket",
  "/checkout",
  "/account",
  "/admin",
  "/orders",
  "/sell/track",
  "/sign-in",
  "/account-deleted",
  "/api",
] as const;

/** /shop/[brand]/[slug], but not /shop/category/[category]. */
const PRODUCT_PAGE = /^\/shop\/(?!category\/)[a-z0-9-]+\/[a-z0-9-]+\/?$/;
/** /sell/[brand]/[model], but not /sell/track/[token]. */
const MODEL_PAGE = /^\/sell\/(?!track\/)[a-z0-9-]+\/[a-z0-9-]+\/?$/;

const IMAGE_EXTENSION = /\.(?:avif|webp|png|jpe?g|gif|svg|ico)$/i;

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type RequestInfo = {
  method: string;
  url: URL;
  /** The page's origin (the worker's `self.location.origin`). */
  origin: string;
  /** `request.destination`: "document", "image", "script", … or "". */
  destination: string;
  /** Extra image origins: the R2 media domain and Sanity's CDN. */
  imageOrigins?: readonly string[];
};

function hasPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isNetworkOnlyPath(pathname: string): boolean {
  return NETWORK_ONLY_PREFIXES.some((prefix) => hasPrefix(pathname, prefix));
}

/** null: let the browser handle it (e.g. other sites' scripts). */
export function cacheRuleFor(req: RequestInfo): CacheRule | null {
  // Server Actions, forms and mutating API calls.
  if (MUTATING.has(req.method.toUpperCase())) return "network-only";
  if (req.method.toUpperCase() !== "GET") return null;

  const sameOrigin = req.url.origin === req.origin;
  const { pathname } = req.url;

  if (!sameOrigin) {
    const isImageHost = req.imageOrigins?.includes(req.url.origin) ?? false;
    return isImageHost && (req.destination === "image" || IMAGE_EXTENSION.test(pathname))
      ? "image-swr"
      : null;
  }

  if (isNetworkOnlyPath(pathname)) return "network-only";
  // The worker and Next's internals must always be fresh.
  if (pathname === "/sw.js" || pathname.startsWith("/__nextjs")) return "network-only";

  if (pathname.startsWith("/_next/static/")) return "static";
  if (
    pathname === "/_next/image" ||
    hasPrefix(pathname, "/media") ||
    hasPrefix(pathname, "/images") ||
    hasPrefix(pathname, "/icons") ||
    (req.destination === "image" && IMAGE_EXTENSION.test(pathname))
  ) {
    return "image-swr";
  }

  if (PRODUCT_PAGE.test(pathname) || MODEL_PAGE.test(pathname)) return "page-swr";

  // Other pages (HTML navigations and RSC requests, which have no destination).
  if (req.destination === "document" || req.destination === "") return "page-network-first";
  return null;
}
