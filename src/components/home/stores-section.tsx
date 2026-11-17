import { NavigationIcon, PhoneIcon } from "lucide-react";

import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { stores } from "@/config/site";
import { telHref } from "@/lib/format";

import { SectionHeading } from "./section-heading";
import { StoreMap } from "./store-map";

export function StoresSection() {
  return (
    <section id="stores" aria-labelledby="stores-heading" className="py-(--spacing-section)">
      <div className="page-container">
        <SectionHeading
          id="stores-heading"
          eyebrow="Visit us"
          title="Pop into a store"
          intro="Sell your phone over the counter, or see refurbished phones in person before you buy."
        />
        <ul className="mt-10 grid gap-6 md:grid-cols-2">
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
                          to {store.name} (opens Google Maps in a new tab)
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
