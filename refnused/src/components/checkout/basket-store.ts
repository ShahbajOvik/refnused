"use client";

import { useSyncExternalStore } from "react";

import { BASKET_COOKIE, BASKET_EVENT, parseBasket } from "@/lib/orders/basket";

/*
 * The basket's product ids, read from its cookie in the browser (for the
 * header count and "In your basket" buttons). The server writes the cookie.
 */

let cache: { raw: string; ids: string[] } = { raw: "", ids: [] };
const EMPTY: string[] = [];

function read(): string[] {
  const raw =
    document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${BASKET_COOKIE}=`))
      ?.slice(BASKET_COOKIE.length + 1) ?? "";
  if (raw !== cache.raw) cache = { raw, ids: parseBasket(raw) };
  return cache.ids;
}

function subscribe(listener: () => void) {
  window.addEventListener(BASKET_EVENT, listener);
  window.addEventListener("focus", listener);
  return () => {
    window.removeEventListener(BASKET_EVENT, listener);
    window.removeEventListener("focus", listener);
  };
}

export function useBasketIds() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** Call after a server action changes the basket cookie. */
export function notifyBasketChanged() {
  window.dispatchEvent(new Event(BASKET_EVENT));
}

/** After a successful order the basket is emptied in the browser. */
export function clearBasketCookie() {
  document.cookie = `${BASKET_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  notifyBasketChanged();
}
