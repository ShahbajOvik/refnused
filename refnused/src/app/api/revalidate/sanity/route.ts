import { revalidateTag } from "next/cache";

import { serverEnv } from "@refnused/database/lib/env.server";
import {
  SANITY_SIGNATURE_HEADER,
  sanityWebhookBodySchema,
  verifySanityWebhook,
} from "@/lib/guides/webhook";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * Sanity webhook: on publish, unpublish or delete of a guide or author,
 * refresh every page built from guides (tag "guides"). Signed with
 * SANITY_REVALIDATE_SECRET; unsigned or stale requests are rejected.
 */
export async function POST(request: Request) {
  const secret = serverEnv.SANITY_REVALIDATE_SECRET;
  if (!secret) return Response.json({ error: "Not configured" }, { status: 404 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return Response.json({ error: "Too large" }, { status: 413 });
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return Response.json({ error: "Too large" }, { status: 413 });

  if (
    !verifySanityWebhook({ secret, body, header: request.headers.get(SANITY_SIGNATURE_HEADER) })
  ) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = sanityWebhookBodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  if (!["guide", "author"].includes(parsed.data._type)) {
    return Response.json({ revalidated: false, reason: "ignored type" });
  }

  revalidateTag("guides", "max");
  return Response.json({ revalidated: true });
}
