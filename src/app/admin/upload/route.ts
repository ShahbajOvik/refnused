import { authorizeStaff } from "@/auth/access";
import { getStaffSession } from "@/auth/guards";
import type { Permission } from "@/auth/roles";
import { mediaUrl } from "@/lib/media";
import { getStorage } from "@/lib/storage";
import { preparePdf, preparePhoto, randomKeyPart, UploadError } from "@/lib/storage/uploads";

const KINDS = {
  "product-photo": { permission: "products.manage", bucket: "media", prefix: "products" },
  "inspection-photo": { permission: "inspections.manage", bucket: "media", prefix: "inspections" },
  certificate: { permission: "products.manage", bucket: "private", prefix: "certificates" },
} as const satisfies Record<
  string,
  { permission: Permission; bucket: "media" | "private"; prefix: string }
>;

/**
 * Admin uploads. Same checks as admin actions: full staff session (both
 * factors, not idle) and the permission for that kind of file.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const kind = form?.get("kind");
  const file = form?.get("file");
  if (typeof kind !== "string" || !(kind in KINDS) || !(file instanceof File)) {
    return Response.json({ error: "Choose a file to upload." }, { status: 400 });
  }
  const config = KINDS[kind as keyof typeof KINDS];
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
