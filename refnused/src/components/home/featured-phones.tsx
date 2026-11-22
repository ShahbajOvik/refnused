import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { Reveal } from "@/components/motion/reveal";
import { ProductCard } from "@/components/shop/product-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { loadFeaturedProducts } from "@/lib/catalogue/queries";

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
      {items.map((item, index) => (
        <Reveal as="li" key={item.id} delay={(index % 3) * 0.08}>
          <ProductCard product={item} sizes="(min-width: 768px) 30vw, 45vw" />
        </Reveal>
      ))}
    </ul>
  );
}
