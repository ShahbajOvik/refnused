import { PhoneIcon, WifiOffIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { REMEMBER_FAILED_URL } from "@/components/pwa/offline-retry";
import { RetryButton } from "@/components/pwa/retry-button";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { OpenNow } from "@/components/stores/open-now";
import { OpeningHoursSummary } from "@/components/stores/opening-hours";
import { StoreAddress } from "@/components/stores/store-actions";
import { telHref } from "@/lib/format";
import { storeName, storePath } from "@/lib/stores";
import { loadPublicStores } from "@/lib/stores-cache";

/*
 * Shown by the service worker (src/sw/sw.ts) when a page can't load and
 * isn't cached. Precached at install, so it must stay static: no cookies,
 * headers or other request data. Store details come from the stores table
 * as of the build or the worker's last update.
 */
export const metadata: Metadata = {
  title: "You’re offline",
  description: "You’re offline. Here’s how to reach our stores.",
  robots: { index: false, follow: false },
};

export default async function OfflinePage() {
  const stores = await loadPublicStores();
  return (
    <div className="page-container max-w-4xl py-8">
      <script dangerouslySetInnerHTML={{ __html: REMEMBER_FAILED_URL }} />
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Offline", href: "/offline" },
        ]}
      />
      <div className="mt-6 flex items-start gap-4">
        <WifiOffIcon className="mt-2 size-8 shrink-0 text-muted-foreground" aria-hidden />
        <div>
          <h1 className="text-3xl font-semibold sm:text-4xl">You’re offline</h1>
          <p className="mt-2 max-w-2xl text-lg text-muted-foreground">
            We couldn’t load that page. Check your connection and try again. Pages you’ve opened
            recently, like phones you’ve looked at, may still work.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <RetryButton />
            <Link
              href="/"
              className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Go to the home page
            </Link>
          </div>
        </div>
      </div>

      <section aria-labelledby="offline-stores" className="mt-10">
        <h2 id="offline-stores" className="text-2xl font-semibold">
          Visit or call a store
        </h2>
        <p className="mt-1 text-muted-foreground">
          Sell your phone over the counter, collect an order or ask us anything.
        </p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => (
            <li key={store.slug} className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
              <h3 className="text-lg font-semibold">
                <Link
                  href={storePath(store)}
                  className="rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {storeName(store)}
                </Link>
              </h3>
              <StoreAddress store={store} />
              <OpenNow hours={store.openingHours} />
              <OpeningHoursSummary hours={store.openingHours} />
              <a
                href={telHref(store.phone)}
                className="inline-flex min-h-10 items-center gap-2 font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <PhoneIcon className="size-4" aria-hidden />
                {store.phoneDisplay}
                <span className="sr-only"> ({storeName(store)})</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
