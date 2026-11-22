"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { db } from "@refnused/database/db";
import { addToBasket, MAX_BASKET_ITEMS } from "@refnused/database/lib/orders/basket";
import { getBasketLines } from "@refnused/database/lib/orders/checkout-service";
import { readBasket, readCheckoutToken, writeBasket } from "@/lib/orders/cookies";

export type BasketActionResult =
  { ok: true; count: number } | { ok: false; error: string; count: number };

/** Adds a phone to the basket. Only its id is stored; prices always come from the database. */
export async function addToBasketAction(productId: unknown): Promise<BasketActionResult> {
  const ids = await readBasket();
  const id = z.uuid().safeParse(productId);
  if (!id.success) return { ok: false, error: "That phone couldn’t be found.", count: ids.length };

  const [line] = await getBasketLines(db, [id.data], { accessToken: await readCheckoutToken() });
  if (!line?.available) {
    return {
      ok: false,
      error: "Sorry, this phone has just been sold or reserved.",
      count: ids.length,
    };
  }
  const next = addToBasket(ids, id.data);
  if (next.full) {
    return {
      ok: false,
      error: `Your basket can hold up to ${MAX_BASKET_ITEMS} phones.`,
      count: ids.length,
    };
  }
  await writeBasket(next.ids);
  return { ok: true, count: next.ids.length };
}

/** Form action on the basket page. */
export async function removeFromBasketAction(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("productId"));
  if (!id.success) return;
  await writeBasket((await readBasket()).filter((x) => x !== id.data));
  refresh();
}
