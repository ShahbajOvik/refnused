import { authorizeStaff } from "@/auth/access";
import { getStaffSession } from "@/auth/guards";
import type { Permission } from "@/auth/roles";
import { publicEnv } from "@/lib/env";
import { mediaUrl } from "@/lib/media";
import { isSameOriginRequest } from "@/lib/security/same-origin";
import { getStorage } from "@/lib/storage";
import {
  MAX_UPLOAD_BYTES,
  preparePdf,
  preparePhoto,
  randomKeyPart,
  UploadError,
} from "@/lib/storage/uploads";
import { z } from "zod";

const KINDS = {
  "product-photo": { permission: "products.manage", bucket: "media", prefix: "products" },
  "inspection-photo": { permission: "inspections.manage", bucket: "media", prefix: "inspections" },
  certificate: { permission: "products.manage", bucket: "private", prefix: "certificates" },
  "store-photo": { permission: "stores.manage", bucket: "media", prefix: "stores" },
} as const satisfies Record<
  string,
  { permission: Permission; bucket: "media" | "private"; prefix: string }
>;

/**
 * Admin uploads. Same checks as admin actions: full staff session (both
 * factors, not idle) and the permission for that kind of file.
 */
const uploadSchema = z.object({
  kind: z.enum(Object.keys(KINDS) as [keyof typeof KINDS, ...(keyof typeof KINDS)[]]),
  file: z.instanceof(File),
});

export async function POST(request: Request) {
  // CSRF: only our own admin pages may upload (the cookie is SameSite=Lax too).
  if (!isSameOriginRequest(request, publicEnv.NEXT_PUBLIC_SITE_URL)) {
    return Response.json({ error: "Not allowed" }, { status: 403 });
  }
  // Refuse oversized bodies before reading them (multipart overhead allowed for).
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) {
    return Response.json({ error: "Files must be 10MB or smaller." }, { status: 413 });
  }
  const form = await request.formData().catch(() => null);
  const parsed = uploadSchema.safeParse({ kind: form?.get("kind"), file: form?.get("file") });
  if (!parsed.success) {
    return Response.json({ error: "Choose a file to upload." }, { status: 400 });
  }
  const { kind, file } = parsed.data;
  const config = KINDS[kind];
  const { status, record } = await getStaffSession();
  const auth = authorizeStaff(status, record, config.permission);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });

  try {
    const prepared =
      config.bucket === "private" ? await preparePdf(file) : await preparePhoto(file);
    const date = new Date().toISOString().slice(0, 7);
    const ext = prepared.contentType === "application/pdf" ? "pdf" : "webp";
    const key = `${config.prefix}/${date}/${randomKeyPart()}.${ext}`;
    await getStorage().put(config.bucket, key, prepared);
    const url = config.bucket === "media" ? mediaUrl(key) : `/admin/files/${key}`;
    return Response.json({ key, url });
  } catch (error) {
    if (error instanceof UploadError)
      return Response.json({ error: error.message }, { status: 400 });
    console.error("[admin] upload failed", error);
    return Response.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
}
