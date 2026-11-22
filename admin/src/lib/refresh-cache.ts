import "server-only";

import { revalidateTag } from "next/cache";

import { revalidateWebsite } from "@refnused/database/lib/revalidate-website";

/**
 * After a change to public data: refresh this app's cache and ask the
 * website (another app) to refresh its own. Use instead of revalidateTag()
 * for products, prices, the catalogue and stores.
 */
export async function refreshCache(...tags: string[]): Promise<void> {
  for (const tag of tags) revalidateTag(tag, "max");
  await revalidateWebsite(...tags);
}
