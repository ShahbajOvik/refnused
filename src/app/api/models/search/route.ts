import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { modelSearchQuerySchema } from "@/lib/catalogue/home-data";
import { loadModelSearch } from "@/lib/catalogue/queries";
import { serverEnv } from "@/lib/env.server";
import { consumeRateLimit, rateLimitKey } from "@/lib/security/rate-limit";

/** Quick-quote search: GET /api/models/search?q=iphone 15 */
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = await consumeRateLimit(db, {
    key: rateLimitKey("search:ip", ip, serverEnv.AUTH_SECRET),
    limit: 120,
    windowSeconds: 60,
  }).catch(() => null);
  if (limit && !limit.allowed) {
    return NextResponse.json(
      { error: "Too many searches" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }
  const parsed = modelSearchQuerySchema.safeParse(request.nextUrl.searchParams.get("q") ?? "");
  if (!parsed.success) {
    return NextResponse.json({ results: [] }, { status: 400 });
  }
  const results = await loadModelSearch(parsed.data);
  if (results === null) {
    return NextResponse.json({ error: "Search is unavailable right now" }, { status: 503 });
  }
  return NextResponse.json(
    { results },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
