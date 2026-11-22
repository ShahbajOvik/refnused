import { authorizeStaff } from "@/auth/access";
import { getStaffSession } from "@/auth/guards";
import { db } from "@refnused/database/db";
import { recordAudit } from "@refnused/database/lib/audit";
import { getPriceTable, pricesToCsv } from "@/lib/admin/prices";
import { getRequestMeta } from "@refnused/database/lib/request-meta";

/** Trade-in prices as CSV (all models, or ?model=slug). */
export async function GET(request: Request) {
  const { status, record } = await getStaffSession();
  const auth = authorizeStaff(status, record, "prices.update");
  if (!auth.ok) return new Response("Not allowed", { status: 403 });
  const model = new URL(request.url).searchParams.get("model");
  const slug = model && /^[a-z0-9-]{1,80}$/.test(model) ? model : undefined;
  const csv = pricesToCsv(await getPriceTable(db, slug));
  await recordAudit(
    db,
    {
      actorType: "staff",
      actorId: auth.staff.id,
      action: "price.exported",
      entityType: "trade_in_price",
      entityId: slug ?? "all",
    },
    await getRequestMeta(),
  );
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="trade-in-prices-${slug ?? "all"}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
