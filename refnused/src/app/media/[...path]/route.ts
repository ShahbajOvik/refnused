import { getStorage, r2Enabled } from "@/lib/storage";

/**
 * Serves uploaded photos in development and tests (no R2). With R2 they
 * come straight from the bucket's public domain, so this returns 404.
 * Sample photos in public/media are served before this route.
 */
export async function GET(_request: Request, { params }: RouteContext<"/media/[...path]">) {
  if (r2Enabled) return new Response("Not found", { status: 404 });
  const { path } = await params;
  const key = path.join("/");
  try {
    const object = await getStorage().get("media", key);
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.bytes, {
      headers: {
        "Content-Type": object.contentType,
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
