import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";

import { AwsClient } from "aws4fetch";

import { serverEnv } from "../env.server";

/*
 * File storage: Cloudflare R2 (S3 API) in production, a local folder
 * otherwise. Two buckets:
 * - media: public (product and inspection photos), served from
 *   NEXT_PUBLIC_MEDIA_BASE_URL (R2 custom domain) or /media locally;
 * - private: data-wipe certificates, only served to signed-in staff.
 */

export type Bucket = "media" | "private";

export type StoredObject = { bytes: Uint8Array<ArrayBuffer>; contentType: string };

export interface ObjectStorage {
  put(bucket: Bucket, key: string, object: StoredObject): Promise<void>;
  get(bucket: Bucket, key: string): Promise<StoredObject | null>;
}

/** Keys are ours, but check anyway: no traversal, no odd characters. */
export function assertSafeKey(key: string) {
  if (!/^[a-z0-9][a-z0-9/_.-]{0,250}$/i.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error("Invalid storage key");
  }
}

function r2Storage(): ObjectStorage {
  const client = new AwsClient({
    accessKeyId: serverEnv.R2_ACCESS_KEY_ID!,
    secretAccessKey: serverEnv.R2_SECRET_ACCESS_KEY!,
    service: "s3",
    region: "auto",
  });
  const endpoint = `https://${serverEnv.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const bucketName = (bucket: Bucket) =>
    bucket === "media" ? serverEnv.R2_MEDIA_BUCKET! : serverEnv.R2_PRIVATE_BUCKET!;
  const url = (bucket: Bucket, key: string) =>
    `${endpoint}/${bucketName(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  return {
    async put(bucket, key, object) {
      assertSafeKey(key);
      const response = await client.fetch(url(bucket, key), {
        method: "PUT",
        body: object.bytes,
        headers: {
          "Content-Type": object.contentType,
          "Cache-Control": bucket === "media" ? "public, max-age=31536000, immutable" : "private",
        },
      });
      if (!response.ok) throw new Error(`R2 upload failed (${response.status})`);
    },
    async get(bucket, key) {
      assertSafeKey(key);
      const response = await client.fetch(url(bucket, key));
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`R2 download failed (${response.status})`);
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get("content-type") ?? "application/octet-stream",
      };
    },
  };
}

/** Development and tests only. */
function localStorage(root: string): ObjectStorage {
  const path = (bucket: Bucket, key: string) => {
    assertSafeKey(key);
    const full = normalize(join(root, bucket, key));
    if (!full.startsWith(normalize(join(root, bucket)) + sep))
      throw new Error("Invalid storage key");
    return full;
  };
  return {
    async put(bucket, key, object) {
      const file = path(bucket, key);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, object.bytes);
      await writeFile(`${file}.type`, object.contentType);
    },
    async get(bucket, key) {
      const file = path(bucket, key);
      try {
        const [bytes, contentType] = await Promise.all([
          readFile(file),
          readFile(`${file}.type`, "utf8").catch(() => "application/octet-stream"),
        ]);
        return {
          bytes: new Uint8Array(
            bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ) as ArrayBuffer,
          ),
          contentType,
        };
      } catch {
        return null;
      }
    },
  };
}

export const r2Enabled = Boolean(
  serverEnv.R2_ACCOUNT_ID &&
  serverEnv.R2_ACCESS_KEY_ID &&
  serverEnv.R2_SECRET_ACCESS_KEY &&
  serverEnv.R2_MEDIA_BUCKET &&
  serverEnv.R2_PRIVATE_BUCKET,
);

let storage: ObjectStorage | undefined;

export function getStorage(): ObjectStorage {
  if (storage) return storage;
  if (r2Enabled) {
    storage = r2Storage();
  } else {
    if (process.env.VERCEL_ENV === "production")
      throw new Error("R2 storage is required in production");
    // Default: .media at the repo root (apps run from their own folders).
    storage = localStorage(serverEnv.MEDIA_LOCAL_DIR ?? join(process.cwd(), "..", ".media"));
  }
  return storage;
}
