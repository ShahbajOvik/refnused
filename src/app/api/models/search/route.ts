import { NextResponse, type NextRequest } from "next/server";

import { modelSearchQuerySchema } from "@/lib/catalogue/home-data";
import { loadModelSearch } from "@/lib/catalogue/queries";

/** Quick-quote search: GET /api/models/search?q=iphone 15 */
export async function GET(request: NextRequest) {
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
