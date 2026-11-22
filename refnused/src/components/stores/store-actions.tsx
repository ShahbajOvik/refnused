import { NavigationIcon, PhoneIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { telHref } from "@refnused/database/lib/format";
import { type PublicStore, storeAddressLines, storeDirectionsUrl, storeName } from "@refnused/database/lib/stores";

/** Tap-to-call and directions, with names that say which store. */
export function StoreActions({ store }: { store: PublicStore }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild>
        <a href={telHref(store.phone)}>
          <PhoneIcon aria-hidden />
          Call {store.phoneDisplay}
          <span className="sr-only"> ({storeName(store)})</span>
        </a>
      </Button>
      <Button asChild variant="outline">
        <a href={storeDirectionsUrl(store)} target="_blank" rel="noopener noreferrer">
          <NavigationIcon aria-hidden />
          Directions
          <span className="sr-only"> to {storeName(store)} (opens Google Maps in a new tab)</span>
        </a>
      </Button>
    </div>
  );
}

/** The store's address, always written the same way. */
export function StoreAddress({ store, className }: { store: PublicStore; className?: string }) {
  const [street, town] = storeAddressLines(store);
  return (
    <address className={className ?? "text-muted-foreground not-italic"}>
      {street}
      <br />
      {town}
    </address>
  );
}
