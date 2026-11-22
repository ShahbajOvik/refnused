import { revalidateTag } from "next/cache";

import { serverEnv } from "@refnused/database/lib/env.server";
import {
  REVALIDATE_SIGNATURE_HEADER,
  revalidateBodySchema,
  verifyRevalidation,
} from "@refnused/database/lib/revalidate";

const MAX_BODY_BYTES = 8 * 1024;

/**
 * Cache refresh requested by the admin app after it changes products,
 * prices, the catalogue or stores. Signed with REVALIDATE_SECRET
 * (@refnused/database/lib/revalidate); anything else is rejected.
 */
export async function POST(request: Request) {
  const secret = serverEnv.REVALIDATE_SECRET;
  if (!secret) return Response.json({ error: "Not configured" }, { status: 404 });

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return Response.json({ error: "Too large" }, { status: 413 });
  if (
    !verifyRevalidation({ secret, body, header: request.headers.get(REVALIDATE_SIGNATURE_HEADER) })
  ) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = revalidateBodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  for (const tag of parsed.data.tags) revalidateTag(tag, "max");
  return Response.json({ revalidated: parsed.data.tags });
}
