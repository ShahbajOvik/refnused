import "server-only";

import { publicEnv } from "./env";
import { serverEnv } from "./env.server";
import {
  REVALIDATE_PATH,
  REVALIDATE_SIGNATURE_HEADER,
  revalidateBodySchema,
  signRevalidation,
} from "./revalidate";

/**
 * Asks the website to refresh cached data after an admin change (see
 * revalidate.ts). Never throws: a failed refresh only means the website
 * shows the old data until its cache expires (at most an hour). Without
 * REVALIDATE_SECRET (development) it logs instead; production requires it.
 */
export async function revalidateWebsite(...tags: string[]): Promise<void> {
  const parsed = revalidateBodySchema.safeParse({ tags: [...new Set(tags)] });
  if (!parsed.success) {
    console.error("[revalidate] unknown tags", tags);
    return;
  }
  const secret = serverEnv.REVALIDATE_SECRET;
  if (!secret) {
    console.info(
      `[revalidate] REVALIDATE_SECRET not set; website not refreshed (${tags.join(", ")})`,
    );
    return;
  }
  const body = JSON.stringify(parsed.data);
  try {
    const response = await fetch(new URL(REVALIDATE_PATH, publicEnv.NEXT_PUBLIC_SITE_URL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [REVALIDATE_SIGNATURE_HEADER]: signRevalidation(secret, body),
      },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) console.error(`[revalidate] website answered ${response.status}`);
  } catch (error) {
    console.error("[revalidate] website unreachable", (error as Error).name);
  }
}
