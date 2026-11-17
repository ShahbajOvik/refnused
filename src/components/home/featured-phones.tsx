import { BatteryFullIcon, MapPinIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { HERO_POSTER } from "@/components/home/hero/config";
import { Reveal } from "@/components/motion/reveal";
import { GradeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { loadFeaturedProducts } from "@/lib/catalogue/queries";
import { formatPrice } from "@/lib/format";

import { SectionHeading } from "./section-heading";

export function FeaturedPhones() {
  return (
    <section aria-labelledby="featured-heading" className="py-(--spacing-section)">
      <div className="page-container">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            id="featured-heading"
            eyebrow="Buy refurbished"
            title="Just in"
            intro="Every phone is tested, graded and data-wiped, with a warranty."
          />
          <Button asChild variant="outline">
            <Link href="/shop">Shop all phones</Link>
          </Button>
        </div>
        <Suspense fallback={<GridSkeleton />}>
          <FeaturedGrid />
        </Suspense>
      </div>
    </section>
  );
}

const gridClass = "mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:gap-6";

function GridSkeleton() {
  return (
    <div className={gridClass} aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-[23rem] rounded-2xl sm:h-[25rem]" />
      ))}
    </div>
  );
}

async function FeaturedGrid() {
  await connection();
  const items = await loadFeaturedProducts();

  if (!items?.length) {
    return (
      <p className="mt-10 rounded-2xl border bg-muted/40 p-8 text-center text-muted-foreground">
        New stock is on its way. Check back soon or{" "}
        <Link
          href="/stores"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          visit a store
        </Link>
        .
      </p>
    );
  }

  return (
    <ul className={gridClass}>
      {items.map((item, index) => {
        const title = `${item.brand} ${item.model}`;
        return (
          <Reveal
            as="li"
            key={item.id}
            delay={(index % 3) * 0.08}
            className="group relative flex h-[23rem] flex-col overflow-hidden rounded-2xl border bg-card sm:h-[25rem]"
          >
            <div className="relative flex-1 bg-muted/50">
              <Image
                src={HERO_POSTER.src}
                alt=""
                fill
                sizes="(min-width: 768px) 30vw, 45vw"
                className="object-contain p-4 transition-transform duration-300 group-hover:scale-105"
              />
              <GradeBadge grade={item.grade} className="absolute top-3 left-3" />
            </div>
            <div className="flex flex-col gap-1 p-4">
              <h3 className="font-semibold">
                <Link
                  href={`/shop/${item.id}`}
                  className="after:absolute after:inset-0 focus-visible:outline-none after:focus-visible:rounded-2xl after:focus-visible:ring-2 after:focus-visible:ring-ring"
                >
                  {title}
                </Link>
              </h3>
              <p className="text-sm text-muted-foreground">
                {item.storageGb}GB · {item.colour}
              </p>
              <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <BatteryFullIcon className="size-3.5" aria-hidden />
                  Battery {item.batteryHealthPercent}%
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPinIcon className="size-3.5" aria-hidden />
                  {item.storeTown}
                </span>
              </p>
              <p className="mt-1 text-lg font-semibold">{formatPrice(item.pricePence)}</p>
            </div>
          </Reveal>
        );
      })}
    </ul>
  );
}
