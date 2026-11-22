import "server-only";

import { cookies } from "next/headers";

import { BASKET_COOKIE, parseBasket, serializeBasket } from "@refnused/database/lib/orders/basket";

/** httpOnly: the token behind this browser's latest checkout attempt. */
export const CHECKOUT_COOKIE = "ru_checkout";

const secure = process.env.NODE_ENV === "production";

export async function readBasket(): Promise<string[]> {
  return parseBasket((await cookies()).get(BASKET_COOKIE)?.value);
}

export async function writeBasket(ids: string[]) {
  const store = await cookies();
  if (ids.length === 0) {
    store.delete(BASKET_COOKIE);
    return;
  }
  store.set(BASKET_COOKIE, serializeBasket(ids), {
    path: "/",
    sameSite: "lax",
    secure,
    // Not httpOnly: the header reads it for the item count. It holds only ids.
    httpOnly: false,
    maxAge: 30 * 86_400,
  });
}

export async function readCheckoutToken(): Promise<string | null> {
  return (await cookies()).get(CHECKOUT_COOKIE)?.value ?? null;
}

export async function writeCheckoutToken(token: string) {
  (await cookies()).set(CHECKOUT_COOKIE, token, {
    path: "/",
    sameSite: "lax",
    secure,
    httpOnly: true,
    maxAge: 86_400,
  });
}
