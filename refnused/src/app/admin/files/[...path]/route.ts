import { authorizeStaff } from "@/auth/access";
import { getStaffSession } from "@/auth/guards";
import { getStorage } from "@refnused/database/lib/storage";

/** Private files (data-wipe certificates), for signed-in staff only. */
export async function GET(_request: Request, { params }: RouteContext<"/admin/files/[...path]">) {
  const { status, record } = await getStaffSession();
  const auth = authorizeStaff(status, record, "products.manage");
  if (!auth.ok) return new Response("Not allowed", { status: 403 });
  const key = (await params).path.join("/");
  if (!key.startsWith("certificates/")) return new Response("Not found", { status: 404 });
  const object = await getStorage()
    .get("private", key)
    .catch(() => null);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.bytes, {
    headers: {
      "Content-Type": object.contentType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
