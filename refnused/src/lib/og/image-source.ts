import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { cacheLife } from "next/cache";
import sharp from "sharp";

import { publicEnv } from "@refnused/database/lib/env";
import { getStorage } from "@refnused/database/lib/storage";

/*
 * Loads a picture for an Open Graph card as a PNG data URI. next/og can't
 * decode WebP or AVIF (our uploads are WebP), so everything goes through
 * sharp. Returns null on any failure: the card is drawn without a picture.
 */

const MAX_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 4000;
const PUBLIC_DIR = path.join(process.cwd(), "public");

/** Only our media bucket and Sanity's CDN, never an arbitrary URL. */
function allowedRemote(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  if (url.hostname === "cdn.sanity.io") return true;
  const media = publicEnv.NEXT_PUBLIC_MEDIA_BASE_URL;
  return !!media && url.href.startsWith(`${media}/`);
}

async function fetchRemote(url: URL): Promise<Uint8Array | null> {
  if (!allowedRemote(url)) return null;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "error",
  });
  if (!response.ok) return null;
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.byteLength > MAX_BYTES ? null : bytes;
}

async function readLocal(src: string): Promise<Uint8Array | null> {
  const relative = decodeURIComponent(src.split("?")[0]!).replace(/^\/+/, "");
  const file = path.resolve(PUBLIC_DIR, relative);
  if (!file.startsWith(`${PUBLIC_DIR}${path.sep}`)) return null;
  try {
    return await readFile(file);
  } catch {
    // Uploaded photos without R2 live in local storage, served by /media/[...path].
    if (!relative.startsWith("media/")) return null;
    const object = await getStorage().get("media", relative.slice("media/".length));
    return object?.bytes ?? null;
  }
}

export async function loadOgPicture(
  src: string | null | undefined,
  box: { width: number; height: number },
): Promise<string | null> {
  if (!src) return null;
  try {
    const bytes = /^https?:\/\//.test(src) ? await fetchRemote(new URL(src)) : await readLocal(src);
    if (!bytes) return null;
    const png = await sharp(bytes, { limitInputPixels: 40_000_000 })
      .resize({ ...box, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch (error) {
    console.warn("Open Graph picture unavailable", src, error);
    return null;
  }
}

/** loadOgPicture, cached: photo keys never change, so the result can live for days. */
export async function cachedOgPicture(
  src: string | null | undefined,
  box: { width: number; height: number },
): Promise<string | null> {
  "use cache";
  cacheLife("days");
  return loadOgPicture(src, box);
}
