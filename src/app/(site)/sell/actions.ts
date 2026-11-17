"use server";

import { after } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { recordAudit } from "@/lib/audit";
import { getFieldCipher } from "@/lib/crypto/field-encryption";
import { serverEnv, turnstileEnabled } from "@/lib/env.server";
import { sendEmail } from "@/lib/notify/email";
import { sendSms } from "@/lib/notify/sms";
import { getRequestMeta } from "@/lib/request-meta";
import { consumeRateLimit, rateLimitKey } from "@/lib/security/rate-limit";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { absoluteUrl } from "@/lib/seo";
import { computeOffer } from "@/lib/sell/offer-service";
import { PricingError, type OfferDeduction } from "@/lib/sell/pricing";
import {
  quoteConfirmationEmail,
  quoteConfirmationSms,
  type QuoteMessageInput,
} from "@/lib/sell/quote-messages";
import {
  answersSchema,
  createQuote,
  createQuoteSchema,
  getQuoteByTrackingToken,
} from "@/lib/sell/quote-service";
import { isUkMobile } from "@/lib/validation/uk";

export type OfferActionResult =
  | {
      ok: true;
      offerPence: number;
      grade: "A" | "B" | "C" | "faulty";
      basePricePence: number;
      deductions: OfferDeduction[];
      acceptableOnline: boolean;
    }
  | { ok: false; error: string };

export type QuoteActionResult =
  | { ok: true; trackingPath: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]>; newOfferPence?: number };

/** Zod issues keyed by dotted path ("bank.sortCode"), for nested fields. */
function fieldErrorsByPath(error: z.ZodError) {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    (errors[path] ??= []).push(issue.message);
  }
  return errors;
}

const TOO_MANY = "You’ve made a lot of requests. Please wait a few minutes and try again.";

async function limited(scope: string, identifier: string, limit: number, windowSeconds: number) {
  const result = await consumeRateLimit(db, {
    key: rateLimitKey(scope, identifier, serverEnv.AUTH_SECRET),
    limit,
    windowSeconds,
  });
  return !result.allowed;
}

/** Instant offer. Calculated on the server from database prices only. */
export async function getOfferAction(raw: {
  variantId: string;
  answers: Record<string, string>;
}): Promise<OfferActionResult> {
  const meta = await getRequestMeta();
  if (await limited("sell:offer:ip", meta.ipAddress ?? "unknown", 40, 600)) {
    return { ok: false, error: TOO_MANY };
  }
  const parsed = z.object({ variantId: z.uuid(), answers: answersSchema }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please answer every question." };
  try {
    const offer = await computeOffer(db, parsed.data);
    return { ok: true, ...offer };
  } catch (error) {
    if (error instanceof PricingError) return { ok: false, error: "Please answer every question." };
    throw error;
  }
}

/** Accepts the offer: validates everything again on the server and creates the quote. */
export async function createQuoteAction(
  raw: unknown,
  turnstileToken: string | null,
): Promise<QuoteActionResult> {
  const meta = await getRequestMeta();
  const ip = meta.ipAddress ?? "unknown";
  // Attempts (including ones with mistakes) per IP; successful quotes per email below.
  if (await limited("sell:quote:ip", ip, 10, 3600)) return { ok: false, error: TOO_MANY };

  if (turnstileEnabled) {
    const check = await verifyTurnstile(turnstileToken, {
      secret: serverEnv.TURNSTILE_SECRET_KEY!,
      remoteIp: meta.ipAddress,
      action: "sell_quote",
    });
    if (!check.success) {
      return { ok: false, error: "We couldn’t confirm you’re not a robot. Please try again." };
    }
  }

  const parsed = createQuoteSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the highlighted details.",
      fieldErrors: fieldErrorsByPath(parsed.error),
    };
  }
  if (await limited("sell:quote:email", parsed.data.email, 3, 86_400)) {
    return { ok: false, error: TOO_MANY };
  }

  const result = await createQuote(db, parsed.data, { cipher: getFieldCipher(), meta });
  if (!result.ok) {
    switch (result.reason) {
      case "price_changed":
        return {
          ok: false,
          error: "Our price for this phone has just changed. Please check the new offer.",
          newOfferPence: result.offerPence,
        };
      case "imei_in_use":
        return {
          ok: false,
          error:
            "This phone already has an open quote with us. Check your email for it, or contact us.",
          fieldErrors: { imei: ["This IMEI already has an open quote"] },
        };
      case "not_acceptable_online":
        return {
          ok: false,
          error: "We can’t accept this phone online. Bring it to a store and we’ll take a look.",
        };
      default:
        return { ok: false, error: "Something went wrong. Please go back and check your answers." };
    }
  }

  const trackingPath = `/sell/track/${result.trackingToken}`;
  const trackingToken = result.trackingToken;
  const phone = parsed.data.phone;
  const email = parsed.data.email;

  // Confirmations go out after the response, so a slow provider never
  // blocks the customer. Failures are logged; the quote still stands.
  after(async () => {
    const quote = await getQuoteByTrackingToken(db, trackingToken);
    if (!quote) return;
    const message: QuoteMessageInput = {
      name: quote.contactName ?? "",
      reference: quote.reference,
      device: `${quote.brand} ${quote.model}, ${quote.storageGb}GB`,
      offerPence: quote.offeredPricePence,
      priceLockedUntil: quote.priceLockedUntil,
      delivery:
        quote.deliveryMethod === "store_drop_off" && quote.storeName
          ? {
              method: "store_drop_off",
              storeName: quote.storeName,
              storeAddress: `${quote.storeStreet}, ${quote.storeTown} ${quote.storePostcode}`,
            }
          : { method: quote.deliveryMethod === "print_label" ? "print_label" : "postage_pack" },
      trackingUrl: absoluteUrl(trackingPath),
    };
    const failures: string[] = [];
    await sendEmail({ to: email, ...quoteConfirmationEmail(message) }).catch(() =>
      failures.push("email"),
    );
    if (isUkMobile(phone)) {
      await sendSms(phone, quoteConfirmationSms(message)).catch(() => failures.push("sms"));
    }
    if (failures.length) {
      await recordAudit(db, {
        actorType: "system",
        action: "quote.notification_failed",
        entityType: "quote",
        entityId: quote.id,
        changes: { after: { channels: failures } },
      });
    }
  });

  return { ok: true, trackingPath };
}
