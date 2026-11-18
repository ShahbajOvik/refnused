import { randomBytes } from "node:crypto";

import sharp from "sharp";

/*
 * Checks and prepares uploaded files. Never trusts the file name or the
 * browser's content type: the bytes decide.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS = 12;

export class UploadError extends Error {
  override name = "UploadError";
}

function sniff(bytes: Uint8Array): "jpeg" | "png" | "webp" | "avif" | "heic" | "pdf" | null {
  const b = Buffer.from(bytes.subarray(0, 16));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "png";
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (b.toString("ascii", 4, 8) === "ftyp") {
    const brand = b.toString("ascii", 8, 12);
    if (brand.startsWith("avi")) return "avif";
    if (["heic", "heix", "mif1", "msf1"].includes(brand)) return "heic";
  }
  if (b.toString("ascii", 0, 5) === "%PDF-") return "pdf";
  return null;
}

export function randomKeyPart() {
  return randomBytes(9).toString("base64url");
}

/**
 * Photos: any common image (including iPhone HEIC), re-encoded to WebP at
 * most 2000px. Re-encoding strips metadata such as GPS location.
 */
export async function preparePhoto(
  file: File,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string }> {
  if (file.size === 0) throw new UploadError("The photo is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("Photos must be 10MB or smaller.");
  const input = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(input);
  if (!kind || kind === "pdf")
    throw new UploadError("Upload a photo (JPEG, PNG, WebP, AVIF or HEIC).");
  try {
    const output = await sharp(input, { failOn: "error" })
      .rotate() // honour the camera's orientation before metadata is dropped
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return {
      bytes: new Uint8Array(
        output.buffer.slice(
          output.byteOffset,
          output.byteOffset + output.byteLength,
        ) as ArrayBuffer,
      ),
      contentType: "image/webp",
    };
  } catch {
    throw new UploadError("That photo couldn’t be read. Try a JPEG or PNG.");
  }
}

/** Data-wipe certificates: PDF only. */
export async function preparePdf(
  file: File,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string }> {
  if (file.size === 0) throw new UploadError("The certificate is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("Certificates must be 10MB or smaller.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (sniff(bytes) !== "pdf") throw new UploadError("Upload the data-wipe certificate as a PDF.");
  return { bytes, contentType: "application/pdf" };
}
