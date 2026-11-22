import { publicEnv } from "@refnused/database/lib/env";

/** Absolute URL of a page on the public website (a different app and domain). */
export function websiteUrl(path: string): string {
  return new URL(path, publicEnv.NEXT_PUBLIC_SITE_URL).href;
}
