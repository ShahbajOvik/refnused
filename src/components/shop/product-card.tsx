import { BatteryFullIcon, MapPinIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Badge, GradeBadge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/format";
import type { ShopProduct } from "@/lib/shop/catalogue";
import { productImageSrc, productPath } from "@/lib/shop/paths";
import { cn } from "@/lib/utils";

import { CompareToggle } from "./compare-toggle";

type ProductCardProps = {
  product: ShopProduct;
  /** Heading level of the card title, to fit the page outline. */
  headingLevel?: 2 | 3;
  /** Show the "Compare" button. */
  compare?: boolean;
  /** Load the image eagerly (first row of a listing, for LCP). */
  priority?: boolean;
  sizes?: string;
  className?: string;
};

/**
 * One refurbished unit. The whole card is clickable through the title
 * link's ::after overlay, so there's a single link per card for screen
 * readers and keyboard users.
 */
export function ProductCard({
  product: p,
  headingLevel = 3,
  compare = false,
  priority = false,
  sizes = "(min-width: 1024px) 22vw, (min-width: 640px) 30vw, 45vw",
  className,
}: ProductCardProps) {
  const Heading = `h${headingLevel}` as const;
  const name = `${p.brand} ${p.model}`;

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md",
        className,
      )}
    >
      <div className="relative aspect-[4/5] bg-muted/50">
        <Image
          src={productImageSrc(p)}
          alt=""
          fill
          sizes={sizes}
          preload={priority}
          className="object-contain p-4 transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        <GradeBadge grade={p.grade} className="absolute top-3 left-3" />
        {p.status !== "listed" ? (
          <Badge variant="secondary" className="absolute top-3 right-3">
            {p.status === "sold" ? "Sold" : "Reserved"}
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <Heading className="font-semibold">
          <Link
            href={productPath(p)}
            className="after:absolute after:inset-0 focus-visible:outline-none after:focus-visible:rounded-2xl after:focus-visible:ring-2 after:focus-visible:ring-ring"
          >
            {name}
          </Link>
        </Heading>
        <p className="text-sm text-muted-foreground">
          {p.storageGb}GB · {p.colour}
        </p>
        <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <BatteryFullIcon className="size-3.5" aria-hidden />
            Battery {p.batteryHealthPercent}%
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPinIcon className="size-3.5" aria-hidden />
            {p.storeTown}
          </span>
        </p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <p className="text-lg font-semibold">{formatPrice(p.pricePence)}</p>
          {compare && p.status === "listed" ? (
            <CompareToggle slug={p.slug} name={`${name}, ${p.storageGb}GB, ${p.colour}`} />
          ) : null}
        </div>
      </div>
    </article>
  );
}
