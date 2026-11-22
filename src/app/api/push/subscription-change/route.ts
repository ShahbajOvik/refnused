import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { replacePushEndpoint } from "@/lib/push/service";
import { pushSubscriptionSchema } from "@/lib/push/subscription";
import { isRateLimited } from "@/lib/security/guards";

const bodySchema = z.object({
  oldEndpoint: pushSubscriptionSchema.shape.endpoint,
  subscription: pushSubscriptionSchema,
});

/**
 * Called by the service worker on `pushsubscriptionchange`, when the browser
 * replaces a subscription. Moves the old one's topics to the new endpoint.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (await isRateLimited("push:change:ip", ip, 20, 3600)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const text = await request.text();
  if (text.length > 8_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  const moved = await replacePushEndpoint(db, parsed.data);
  return new NextResponse(null, { status: moved ? 204 : 404 });
}
