import { publicEnv } from "./env";

/** Public URL of a media object (R2 key), e.g. "products/abc/front.webp". */
export function mediaUrl(key: string): string {
  const path = key.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
  return `${publicEnv.NEXT_PUBLIC_MEDIA_BASE_URL ?? "/media"}/${path}`;
}
