"use server";

import { db } from "@/db";
import { getFieldCipher } from "@/lib/crypto/field-encryption";
import {
  checkoutSchema,
  previewCheckout,
  previewSchema,
  startCheckout,
} from "@/lib/orders/checkout-service";
import { readBasket, readCheckoutToken, writeCheckoutToken } from "@/lib/orders/cookies";
import { getPaymentGateway } from "@/lib/payments";
import { getRequestMeta } from "@/lib/request-meta";
import {
  BOT_CHECK_FAILED,
  isRateLimited,
  passesBotCheck,
  TOO_MANY_REQUESTS,
} from "@/lib/security/guards";
import { fieldErrorsByPath } from "@/lib/validation/field-errors";

import { TRADE_IN_MESSAGES, toPreviewView, type PreviewView } from "./preview-view";

export type { PreviewView };

export type PreviewActionResult = { ok: true; preview: PreviewView } | { ok: false; error: string };

/** The full price (items, delivery, trade-in credit), worked out on the server. */
export async function previewCheckoutAction(raw: unknown): Promise<PreviewActionResult> {
  const meta = await getRequestMeta();
  if (await isRateLimited("checkout:preview:ip", meta.ipAddress ?? "unknown", 120, 600)) {
    return { ok: false, error: TOO_MANY_REQUESTS };
  }
  const parsed = previewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Choose delivery or collection." };
  const result = await previewCheckout(db, {
    ...parsed.data,
    productIds: await readBasket(),
    accessToken: await readCheckoutToken(),
  });
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "empty_basket" ? "Your basket is empty." : "Choose one of our stores.",
    };
  }
  return { ok: true, preview: toPreviewView(result.preview) };
}

export type StartCheckoutActionResult =
  | {
      ok: true;
      orderNumber: string;
      orderPath: string;
      clientSecret: string;
      /** Only used by the stand-in gateway's test page. */
      paymentIntentId: string;
      expiresAt: string;
      preview: PreviewView;
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
      unavailableProductIds?: string[];
    };

/**
 * Creates the order, holds the phones for 15 minutes and returns the
 * Payment Element's client secret. The amount is the server's total.
 */
export async function startCheckoutAction(
  raw: unknown,
  turnstileToken: string | null,
): Promise<StartCheckoutActionResult> {
  const meta = await getRequestMeta();
  if (await isRateLimited("checkout:start:ip", meta.ipAddress ?? "unknown", 15, 900)) {
    return { ok: false, error: TOO_MANY_REQUESTS };
  }
  if (!(await passesBotCheck(turnstileToken, "checkout", meta.ipAddress))) {
    return { ok: false, error: BOT_CHECK_FAILED };
  }
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the highlighted details.",
      fieldErrors: fieldErrorsByPath(parsed.error),
    };
  }
  if (await isRateLimited("checkout:start:email", parsed.data.email, 10, 3600)) {
    return { ok: false, error: TOO_MANY_REQUESTS };
  }

  const result = await startCheckout(
    db,
    getPaymentGateway(),
    { ...parsed.data, productIds: await readBasket() },
    {
      cipher: getFieldCipher(),
      previousAccessToken: await readCheckoutToken(),
      meta,
    },
  );
  if (!result.ok) {
    switch (result.reason) {
      case "empty_basket":
        return { ok: false, error: "Your basket is empty." };
      case "unknown_store":
        return {
          ok: false,
          error: "Choose one of our stores.",
          fieldErrors: { "fulfilment.storeSlug": ["Choose a store"] },
        };
      case "unavailable":
        return {
          ok: false,
          error:
            "Sorry, a phone in your basket has just been reserved or sold. Remove it to carry on.",
          unavailableProductIds: result.unavailableProductIds,
        };
      case "trade_in_invalid":
        return {
          ok: false,
          error: "Please check your trade-in.",
          fieldErrors: {
            tradeInReference: [
              result.tradeIn && !result.tradeIn.ok
                ? TRADE_IN_MESSAGES[result.tradeIn.reason]
                : "That trade-in can’t be used.",
            ],
          },
        };
      case "payment_unavailable":
        return {
          ok: false,
          error: "We can’t take payments right now. Please try again in a few minutes.",
        };
    }
  }

  await writeCheckoutToken(result.accessToken);
  return {
    ok: true,
    orderNumber: result.orderNumber,
    orderPath: `/orders/${result.accessToken}`,
    clientSecret: result.clientSecret,
    paymentIntentId: result.paymentIntentId,
    expiresAt: result.expiresAt.toISOString(),
    preview: toPreviewView(result.preview),
  };
}
