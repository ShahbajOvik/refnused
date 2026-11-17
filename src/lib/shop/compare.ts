import { z } from "zod";

import { MAX_COMPARE_ITEMS } from "./compare-limit";

export { MAX_COMPARE_ITEMS };

const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(120);

/** ?items=a,b,c → up to 3 unique, valid unit slugs in order. Junk is dropped. */
export function parseCompareItems(raw: string | string[] | undefined): string[] {
  const values = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((v) => v.split(","));
  const slugs: string[] = [];
  for (const value of values) {
    const parsed = slugSchema.safeParse(value.trim());
    if (parsed.success && !slugs.includes(parsed.data)) slugs.push(parsed.data);
    if (slugs.length === MAX_COMPARE_ITEMS) break;
  }
  return slugs;
}
