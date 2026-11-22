"use server";

import { z } from "zod";

import { db } from "@/db";
import { currentCustomer } from "@/lib/account/session";
import { getFieldCipher } from "@/lib/crypto/field-encryption";
import { publicEnv } from "@/lib/env";
import { getOrderByAccessToken } from "@/lib/orders/order-service";
import { getRequestMeta } from "@/lib/request-meta";
import { isRateLimited, TOO_MANY_REQUESTS } from "@/lib/security/guards";
import { getQuoteByTrackingToken } from "@/lib/sell/quote-service";

import {
  hasPushTopic,
  PUSH_PATH_CONTEXT,
  removePushTopic,
  savePushTopic,
  type PushTarget,
} from "./service";
import { pushSubscriptionSchema, pushTopicInputSchema, type PushTopicInput } from "./subscription";

/*
 * Turning push updates on and off for a quote, an order or price alerts.
 *
 * Access: a quote or order needs its secret link token (the same thing that
 * opens its page); price alerts need the customer's session. These take no
 * free text and only act on things the caller can already see, so they use
 * Zod and rate limits but no Turnstile (it would need a second widget on
 * pages that already have one, for a single button).
 */

export type PushActionResult = { ok: true } | { ok: false; error: string };

const NOT_FOUND = "We couldn’t find that. Refresh the page and try again.";

async function resolveTarget(
  topic: PushTopicInput,
): Promise<{ target: PushTarget; path: string | null } | null> {
  switch (topic.kind) {
    case "quote": {
      const quote = await getQuoteByTrackingToken(db, topic.token);
      return quote
        ? { target: { kind: "quote", quoteId: quote.id }, path: `/sell/track/${topic.token}` }
        : null;
    }
    case "order": {
      const order = await getOrderByAccessToken(db, topic.token);
      return order
        ? { target: { kind: "order", orderId: order.id }, path: `/orders/${topic.token}` }
        : null;
    }
    case "price_alerts": {
      const customer = await currentCustomer();
      return customer
        ? { target: { kind: "price_alerts", customerId: customer.id }, path: null }
        : null;
    }
  }
}

async function limited(scope: string, limit: number) {
  const meta = await getRequestMeta();
  return isRateLimited(scope, meta.ipAddress ?? "unknown", limit, 3600);
}

export async function subscribePushAction(raw: unknown): Promise<PushActionResult> {
  if (!publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    return { ok: false, error: "Notifications aren’t available right now." };
  }
  if (await limited("push:subscribe:ip", 30)) return { ok: false, error: TOO_MANY_REQUESTS };
  const parsed = z
    .object({ subscription: pushSubscriptionSchema, topic: pushTopicInputSchema })
    .safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "This browser’s notification service isn’t supported." };
  }
  const resolved = await resolveTarget(parsed.data.topic);
  if (!resolved) return { ok: false, error: NOT_FOUND };
  const result = await savePushTopic(db, {
    subscription: parsed.data.subscription,
    target: resolved.target,
    pathEncrypted: resolved.path
      ? getFieldCipher().encrypt(resolved.path, PUSH_PATH_CONTEXT)
      : null,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: "This browser is following a lot already. Turn some updates off first.",
    };
  }
  return { ok: true };
}

const endpointInput = z.object({
  endpoint: pushSubscriptionSchema.shape.endpoint,
  topic: pushTopicInputSchema,
});

/** Stops updates for the topic. `remaining` tells the browser whether to unsubscribe entirely. */
export async function unsubscribePushAction(
  raw: unknown,
): Promise<{ ok: true; remaining: number } | { ok: false; error: string }> {
  if (await limited("push:subscribe:ip", 30)) return { ok: false, error: TOO_MANY_REQUESTS };
  const parsed = endpointInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: NOT_FOUND };
  const resolved = await resolveTarget(parsed.data.topic);
  if (!resolved) return { ok: false, error: NOT_FOUND };
  const { remaining } = await removePushTopic(db, {
    endpoint: parsed.data.endpoint,
    target: resolved.target,
  });
  return { ok: true, remaining };
}

/** Whether this browser already gets updates for the topic. Never prompts. */
export async function pushStatusAction(raw: unknown): Promise<boolean> {
  if (await limited("push:status:ip", 120)) return false;
  const parsed = endpointInput.safeParse(raw);
  if (!parsed.success) return false;
  const resolved = await resolveTarget(parsed.data.topic);
  if (!resolved) return false;
  return hasPushTopic(db, { endpoint: parsed.data.endpoint, target: resolved.target });
}
