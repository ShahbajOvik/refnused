"use client";

import { CheckIcon, ShoppingBagIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { addToBasketAction } from "@/app/(site)/basket/actions";
import { Button } from "@/components/ui/button";

import { notifyBasketChanged, useBasketIds } from "./basket-store";

/** "Add to basket", then links to the basket and checkout. */
export function AddToBasket({ productId }: { productId: string }) {
  const inBasket = useBasketIds().includes(productId);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (inBasket) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p role="status" className="inline-flex items-center gap-2 font-medium">
          <CheckIcon className="size-5 text-primary" aria-hidden /> In your basket
        </p>
        <Button asChild className="min-h-11 px-5">
          <Link href="/checkout">Checkout</Link>
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/basket">View basket</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        className="min-h-11 self-start px-6"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await addToBasketAction(productId);
            setError(result.ok ? null : result.error);
            notifyBasketChanged();
          })
        }
      >
        <ShoppingBagIcon aria-hidden /> {pending ? "Adding…" : "Add to basket"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
