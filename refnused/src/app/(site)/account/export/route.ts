import { db } from "@refnused/database/db";
import { recordAudit } from "@refnused/database/lib/audit";
import { exportCustomerData } from "@/lib/account/privacy";
import { currentCustomer } from "@/lib/account/session";
import { getRequestMeta } from "@refnused/database/lib/request-meta";
import { isRateLimited } from "@refnused/database/lib/security/guards";

/** "Download my data" (UK GDPR access and portability). Signed-in customers only. */
export async function GET() {
  const customer = await currentCustomer();
  if (!customer) return new Response("Please sign in.", { status: 401 });
  if (await isRateLimited("account:export", customer.id, 5, 3600)) {
    return new Response("Too many downloads. Please try again later.", { status: 429 });
  }
  const data = await exportCustomerData(db, customer.id);
  if (!data) return new Response("Not found.", { status: 404 });
  await recordAudit(
    db,
    {
      actorType: "customer",
      actorId: customer.id,
      action: "customer.data_exported",
      entityType: "customer",
      entityId: customer.id,
    },
    await getRequestMeta(),
  );
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="refurbednused-my-data-${date}.json"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
