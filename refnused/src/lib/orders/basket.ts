/*
 * The basket is a cookie listing product (unit) ids. It holds no prices:
 * every page and action reads prices and availability from the database.
 * Readable by the browser (not httpOnly) only so the header can show a
 * count without making every page dynamic.
 */

export const BASKET_COOKIE = "ru_basket";
export const MAX_BASKET_ITEMS = 5;
/** Custom DOM event fired after the basket changes, for the header count. */
export const BASKET_EVENT = "ru:basket-change";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Unique, valid ids in the order added; junk is dropped. */
export function parseBasket(value: string | undefined | null): string[] {
  if (!value) return [];
  const ids: string[] = [];
  for (const raw of decodeURIComponent(value).split(".")) {
    const id = raw.trim().toLowerCase();
    if (UUID.test(id) && !ids.includes(id)) ids.push(id);
    if (ids.length === MAX_BASKET_ITEMS) break;
  }
  return ids;
}

export function serializeBasket(ids: string[]): string {
  return ids.slice(0, MAX_BASKET_ITEMS).join(".");
}

export function addToBasket(ids: string[], id: string): { ids: string[]; full: boolean } {
  if (ids.includes(id)) return { ids, full: false };
  if (ids.length >= MAX_BASKET_ITEMS) return { ids, full: true };
  return { ids: [...ids, id], full: false };
}
