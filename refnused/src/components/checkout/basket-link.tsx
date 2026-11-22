"use client";

import { ShoppingBagIcon } from "lucide-react";
import Link from "next/link";

import { useBasketIds } from "./basket-store";

/** Header basket icon with the number of phones in it. */
export function BasketLink() {
  const count = useBasketIds().length;
  return (
    <Link
      href="/basket"
      aria-label={count ? `Basket, ${count} ${count === 1 ? "phone" : "phones"}` : "Basket"}
      className="relative inline-flex size-10 items-center justify-center rounded-lg hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <ShoppingBagIcon className="size-5" aria-hidden />
      {count ? (
        <span
          aria-hidden
          data-testid="basket-count"
          className="absolute -top-0.5 -right-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground"
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
