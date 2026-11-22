"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { clearBasketCookie, notifyBasketChanged } from "./basket-store";

/**
 * While we wait for Stripe's webhook to confirm the payment, re-check the
 * order every few seconds (for up to about 2 minutes).
 */
export function OrderStatusRefresher({ waiting }: { waiting: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!waiting) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (tries > 40) window.clearInterval(timer);
      else router.refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [waiting, router]);
  return null;
}

/** Empties the basket once the order is paid. */
export function ClearBasket() {
  useEffect(() => {
    clearBasketCookie();
  }, []);
  return null;
}

/** Tells the header the basket changed (after a server-side removal). */
export function BasketChanged({ count }: { count: number }) {
  useEffect(() => {
    notifyBasketChanged();
  }, [count]);
  return null;
}
