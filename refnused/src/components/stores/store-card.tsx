import Link from "next/link";

import { type PublicStore, storeAddress, storeName, storePath } from "@refnused/database/lib/stores";

import { OpenNow } from "./open-now";
import { OpeningHoursSummary } from "./opening-hours";
import { StoreActions, StoreAddress } from "./store-actions";
import { StoreMap } from "./store-map";

/** Store card for the home page and /stores. */
export function StoreCard({
  store,
  headingLevel = 3,
}: {
  store: PublicStore;
  headingLevel?: 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <>
      <div className="relative aspect-[16/9] border-b bg-muted/40">
        <StoreMap name={storeName(store)} address={storeAddress(store)} />
      </div>
      <div className="flex flex-col gap-4 p-6">
        <div>
          <Heading className="text-xl font-semibold">
            <Link
              href={storePath(store)}
              className="rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {storeName(store)}
            </Link>
          </Heading>
          <StoreAddress store={store} className="mt-1 text-muted-foreground not-italic" />
          <OpenNow hours={store.openingHours} className="mt-2" />
        </div>
        <OpeningHoursSummary hours={store.openingHours} />
        <StoreActions store={store} />
      </div>
    </>
  );
}
