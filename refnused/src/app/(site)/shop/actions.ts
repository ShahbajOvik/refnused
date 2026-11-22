"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { db } from "@refnused/database/db";
import { sendEmail } from "@refnused/database/lib/notify/email";
import { getRequestMeta } from "@refnused/database/lib/request-meta";
import {
  BOT_CHECK_FAILED,
  isRateLimited,
  passesBotCheck,
  TOO_MANY_REQUESTS,
} from "@refnused/database/lib/security/guards";
import { absoluteUrl } from "@refnused/database/lib/seo";
import { estimateTradeIn } from "@/lib/shop/catalogue";
import { TRADE_IN_CONDITION_KEYS, type TradeInSaving } from "@/lib/shop/product-info";
import {
  createStockAlert,
  stockAlertConfirmationEmail,
  stockAlertSchema,
  unsubscribeStockAlert,
} from "@/lib/shop/stock-alerts";
import { fieldErrorsByPath } from "@/lib/validation/field-errors";

export type TradeInEstimateResult =
  | {
      ok: true;
      saving: TradeInSaving;
      productPricePence: number;
      tradeInModel: string;
      sellPath: string;
    }
  | { ok: false; error: string };

const estimateSchema = z.object({
  productId: z.uuid(),
  modelSlug: z.string().regex(/^[a-z0-9-]{1,80}$/),
  storageGb: z.coerce.number().int().positive().max(4096),
  condition: z.enum(TRADE_IN_CONDITION_KEYS),
});

/**
 * Trade-in-and-save estimate. Both the phone's price and the trade-in
 * value are read from the database here; nothing priced in the browser.
 */
export async function estimateTradeInAction(raw: unknown): Promise<TradeInEstimateResult> {
  const meta = await getRequestMeta();
  if (await isRateLimited("shop:tradein:ip", meta.ipAddress ?? "unknown", 30, 600)) {
    return { ok: false, error: TOO_MANY_REQUESTS };
  }
  const parsed = estimateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Choose your phone, storage and condition." };

  const estimate = await estimateTradeIn(db, parsed.data);
  if (!estimate.ok) {
    return {
      ok: false,
      error:
        estimate.reason === "product_unavailable"
          ? "This phone has just sold, so we can’t work out a saving for it."
          : "We don’t have a price for that phone and storage yet. Try a full quote instead.",
    };
  }
  return estimate;
}

export type StockAlertActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** "Tell me when one's in stock" on a sold or reserved unit's page. */
export async function createStockAlertAction(
  raw: unknown,
  turnstileToken: string | null,
): Promise<StockAlertActionResult> {
  const meta = await getRequestMeta();
  if (await isRateLimited("shop:alert:ip", meta.ipAddress ?? "unknown", 10, 3600)) {
    return { ok: false, error: TOO_MANY_REQUESTS };
  }
  if (!(await passesBotCheck(turnstileToken, "stock_alert", meta.ipAddress))) {
    return { ok: false, error: BOT_CHECK_FAILED };
  }
  const parsed = stockAlertSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the highlighted details.",
      fieldErrors: fieldErrorsByPath(parsed.error),
    };
  }
  if (await isRateLimited("shop:alert:email", parsed.data.email, 5, 86_400)) {
    return { ok: false, error: TOO_MANY_REQUESTS };
  }

  const result = await createStockAlert(db, parsed.data);
  if (!result.ok) return { ok: false, error: "This phone isn’t available for alerts." };

  const what = result.storageGb ? `${result.modelName} ${result.storageGb}GB` : result.modelName;
  // Same reply whether or not the alert already existed, so the form
  // can't be used to find out which emails have signed up.
  const message = `Done. We’ll email you when we have the ${what} in stock.`;

  if (result.created && result.unsubscribeToken) {
    const token = result.unsubscribeToken;
    const email = parsed.data.email;
    after(async () => {
      await sendEmail({
        to: email,
        ...stockAlertConfirmationEmail({
          modelName: result.modelName,
          storageGb: result.storageGb,
          unsubscribeUrl: absoluteUrl(`/shop/alerts/${token}`),
          shopUrl: absoluteUrl("/shop"),
        }),
      }).catch((error) => console.error("[shop] stock alert email failed", error));
    });
  }
  return { ok: true, message };
}

/** Form action on the unsubscribe page (a POST, so link scanners can't trigger it). */
export async function unsubscribeStockAlertAction(formData: FormData) {
  const meta = await getRequestMeta();
  const token = z.string().max(100).safeParse(formData.get("token"));
  if (
    !token.success ||
    (await isRateLimited("shop:unsubscribe:ip", meta.ipAddress ?? "unknown", 20, 3600))
  ) {
    return;
  }
  await unsubscribeStockAlert(db, token.data);
  // Show the page again with the alert stopped.
  refresh();
}
