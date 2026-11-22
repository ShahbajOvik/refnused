"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { db } from "@refnused/database/db";
import { orderRequestEmail } from "@refnused/database/lib/orders/messages";
import {
  createOrderRequest,
  getOrderByAccessToken,
  orderRequestSchema,
} from "@refnused/database/lib/orders/order-service";
import { sendEmail } from "@refnused/database/lib/notify/email";
import { getRequestMeta } from "@refnused/database/lib/request-meta";
import {
  BOT_CHECK_FAILED,
  isRateLimited,
  passesBotCheck,
  TOO_MANY_REQUESTS,
} from "@refnused/database/lib/security/guards";
import { absoluteUrl } from "@refnused/database/lib/seo";
import { fieldErrorsByPath } from "@/lib/validation/field-errors";

export type OrderRequestActionResult =
  | { ok: true; reference: string; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const MESSAGES = {
  unknown_order: "We couldn’t find that order.",
  unknown_item: "That phone isn’t part of this order.",
  not_paid: "You can make a request once the order is paid.",
  window_closed:
    "Sorry, this is outside the time allowed. Contact us and we’ll see what we can do.",
  already_open: "There’s already an open request of this kind for this phone.",
} as const;

/** A return (within 14 days) or warranty claim, from the customer's order page. */
export async function createOrderRequestAction(
  token: unknown,
  raw: unknown,
  turnstileToken: string | null,
): Promise<OrderRequestActionResult> {
  const meta = await getRequestMeta();
  if (await isRateLimited("orders:request:ip", meta.ipAddress ?? "unknown", 10, 3600)) {
    return { ok: false, error: TOO_MANY_REQUESTS };
  }
  if (!(await passesBotCheck(turnstileToken, "order_request", meta.ipAddress))) {
    return { ok: false, error: BOT_CHECK_FAILED };
  }
  const orderToken = z.string().max(100).safeParse(token);
  const parsed = orderRequestSchema.safeParse(raw);
  if (!orderToken.success) return { ok: false, error: MESSAGES.unknown_order };
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the highlighted details.",
      fieldErrors: fieldErrorsByPath(parsed.error),
    };
  }

  const result = await createOrderRequest(db, orderToken.data, parsed.data, { meta });
  if (!result.ok) return { ok: false, error: MESSAGES[result.reason] };

  const order = await getOrderByAccessToken(db, orderToken.data);
  const item = order?.items.find((i) => i.id === parsed.data.orderItemId);
  if (order && item) {
    after(() =>
      sendEmail({
        to: order.email,
        ...orderRequestEmail({
          name: order.contactName ?? "there",
          orderNumber: order.orderNumber,
          reference: result.reference,
          type: result.type,
          item: item.description,
          deadline: result.deadline,
          orderUrl: absoluteUrl(`/orders/${orderToken.data}`),
        }),
      }).catch((error) => console.error("[orders] request email failed", error)),
    );
  }
  refresh();
  return {
    ok: true,
    reference: result.reference,
    message:
      result.type === "return"
        ? `Return requested (${result.reference}). We’ll email you a free returns label within 1 working day.`
        : `Warranty claim sent (${result.reference}). We’ll be in touch within 2 working days.`,
  };
}
