import { revalidateTag } from "next/cache";
import { after } from "next/server";

import { db } from "@refnused/database/db";
import { recordAudit } from "@refnused/database/lib/audit";
import { serverEnv } from "@refnused/database/lib/env.server";
import { sendOrderConfirmation } from "@/lib/orders/notify";
import { pushOrderUpdate } from "@refnused/database/lib/push/notify";
import { handleStripeEvent, refundUnfulfillable } from "@/lib/orders/webhook-service";
import { getPaymentGateway } from "@refnused/database/lib/payments";
import { verifyStripeWebhook } from "@refnused/database/lib/payments/gateway";

/**
 * Stripe webhook endpoint. Every request must carry a valid Stripe-Signature
 * for STRIPE_WEBHOOK_SECRET; anything else is rejected before it's parsed.
 * Errors return 500 so Stripe retries; duplicates are acknowledged.
 */
export async function POST(request: Request) {
  const secret = serverEnv.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe] STRIPE_WEBHOOK_SECRET is not set");
    return Response.json({ error: "Webhooks are not configured" }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature" }, { status: 400 });

  // The signature covers the exact bytes, so read the raw body.
  const payload = await request.text();
  let event;
  try {
    event = verifyStripeWebhook(payload, signature, secret);
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  const outcome = await handleStripeEvent(db, event);

  if (outcome.kind === "paid") {
    // The units are sold: refresh shop pages.
    revalidateTag("products", "max");
    after(() => sendOrderConfirmation(outcome.orderId));
    after(() => pushOrderUpdate(outcome.orderId, "paid"));
  }
  if (outcome.kind === "refund_needed") {
    after(async () => {
      try {
        await refundUnfulfillable(getPaymentGateway(), outcome);
        await recordAudit(db, {
          actorType: "system",
          action: "order.auto_refund",
          entityType: "order",
          entityId: outcome.orderId,
          changes: { after: { paymentIntentId: outcome.paymentIntentId } },
        });
      } catch (error) {
        console.error("[stripe] automatic refund failed", error);
        await recordAudit(db, {
          actorType: "system",
          action: "order.auto_refund_failed",
          entityType: "order",
          entityId: outcome.orderId,
          changes: { after: { paymentIntentId: outcome.paymentIntentId } },
        });
      }
    });
  }
  return Response.json({ received: true, outcome: outcome.kind });
}
