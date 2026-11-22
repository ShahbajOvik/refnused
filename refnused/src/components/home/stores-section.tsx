import Link from "next/link";

import { Reveal } from "@/components/motion/reveal";
import { StoreCard } from "@/components/stores/store-card";
import { loadPublicStores } from "@/lib/stores-cache";

import { SectionHeading } from "./section-heading";

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
          {stores.map((store, index) => (
            <Reveal
              as="li"
              key={store.slug}
              delay={index * 0.1}
              className="overflow-hidden rounded-2xl border bg-card"
            >
              <StoreCard store={store} />
            </Reveal>
          ))}
        </ul>
        <p className="mt-8">
          <Link
            href="/stores"
            className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            All stores, parking and stock
          </Link>
        </p>
      </div>
    </section>
  );
}
