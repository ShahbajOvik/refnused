import { NavigationIcon, PhoneIcon } from "lucide-react";

import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { telHref } from "@/lib/format";
import { formatOpeningHours } from "@/lib/stores";
import { loadPublicStores } from "@/lib/stores-cache";

import { SectionHeading } from "./section-heading";
import { StoreMap } from "./store-map";

export async function StoresSection() {
  const stores = await loadPublicStores();
  return (
    <section id="stores" aria-labelledby="stores-heading" className="py-(--spacing-section)">
      <div className="page-container">
        <SectionHeading
          id="stores-heading"
          eyebrow="Visit us"
          title="Pop into a store"
          intro="Sell your phone over the counter, or see refurbished phones in person before you buy."
        />
        <ul className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {stores.map((store, index) => {
            const address = `${store.address.street}, ${store.address.town} ${store.address.postcode}`;
            const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
            return (
              <Reveal
                as="li"
                key={store.slug}
                delay={index * 0.1}
                className="overflow-hidden rounded-2xl border bg-card"
              >
                <div className="relative aspect-[16/9] border-b bg-muted/40">
                  <StoreMap name={store.name} address={address} />
                </div>
                <div className="flex flex-col gap-4 p-6">
                  <div>
                    <h3 className="text-xl font-semibold">
                      {store.name}, {store.address.town}
                    </h3>
                    <address className="mt-1 text-muted-foreground not-italic">{address}</address>
                  </div>
                  <OpeningHoursList hours={formatOpeningHours(store.openingHours)} />
                  <div className="flex flex-wrap gap-2">
                    <Button asChild>
                      <a href={telHref(store.phone)}>
                        <PhoneIcon aria-hidden />
                        Call {store.phoneDisplay}
                      </a>
                    </Button>
                    <Button asChild variant="outline">
                      <a href={directions} target="_blank" rel="noopener noreferrer">
                        <NavigationIcon aria-hidden />
                        Directions
                        <span className="sr-only">
                          {" "}
                          to {store.name}, {store.address.town} (opens Google Maps in a new tab)
                        </span>
                      </a>
                    </Button>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function OpeningHoursList({ hours }: { hours: ReturnType<typeof formatOpeningHours> }) {
  if (!hours) {
    return <p className="text-sm text-muted-foreground">Call for opening hours.</p>;
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
      {hours.map((row) => (
        <div key={row.days} className="contents">
          <dt className="font-medium">{row.days}</dt>
          <dd className="text-muted-foreground">{row.hours}</dd>
        </div>
      ))}
    </dl>
  );
}
