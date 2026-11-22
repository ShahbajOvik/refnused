import "server-only";

import webpush, { WebPushError } from "web-push";

import { db } from "../../db";
import { getFieldCipher } from "../crypto/field-encryption";
import { publicEnv } from "../env";
import { pushEnabled, serverEnv } from "../env.server";

import type { PushPayload } from "./messages";
import {
  listPushRecipients,
  PUSH_PATH_CONTEXT,
  recordPushResults,
  type PushRecipient,
  type PushTarget,
} from "./service";

/** Notifications older than this aren't worth showing. */
const TTL_SECONDS = 24 * 60 * 60;

let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return;
  webpush.setVapidDetails(
    serverEnv.VAPID_SUBJECT,
    publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    serverEnv.VAPID_PRIVATE_KEY!,
  );
  vapidReady = true;
}

/** Only ever open our own pages from a notification. */
function safePath(path: string): string {
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

async function deliver(recipient: PushRecipient, payload: PushPayload) {
  const body = JSON.stringify({ ...payload, url: safePath(payload.url) });
  if (!pushEnabled) {
    // Development: no VAPID keys. Print it like SMS and email.
    console.info(`[push] ${payload.title}: ${payload.body} (${payload.url})`);
    return "sent" as const;
  }
  ensureVapid();
  try {
    await webpush.sendNotification(
      { endpoint: recipient.endpoint, keys: { p256dh: recipient.p256dh, auth: recipient.auth } },
      body,
      { TTL: TTL_SECONDS, urgency: "normal", topic: topicHeader(payload.tag), timeout: 10_000 },
    );
    return "sent" as const;
  } catch (error) {
    // 404/410: the browser unsubscribed or the subscription expired.
    if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
      return "gone" as const;
    }
    // Never log the endpoint or payload: they identify the device and customer.
    console.error(
      "[push] send failed",
      error instanceof WebPushError ? error.statusCode : (error as Error).name,
    );
    return "failed" as const;
  }
}

/** The Topic header lets the push service replace an undelivered message (max 32 url-safe chars). */
function topicHeader(tag: string) {
  return tag.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 32);
}

/**
 * Sends to every browser following the target. `build` gets the stored
 * (decrypted) path for quotes and orders. Never throws: push is a bonus on
 * top of email and SMS.
 */
export async function pushToTarget(
  target: PushTarget,
  build: (path: string | null) => PushPayload | null,
): Promise<{ sent: number }> {
  try {
    const recipients = await listPushRecipients(db, target);
    if (!recipients.length) return { sent: 0 };
    const cipher = getFieldCipher();
    const results = await Promise.all(
      recipients.map(async (recipient) => {
        const path = recipient.pathEncrypted
          ? cipher.decrypt(recipient.pathEncrypted, PUSH_PATH_CONTEXT)
          : null;
        const payload = build(path);
        if (!payload) return ["skipped", recipient.subscriptionId] as const;
        return [await deliver(recipient, payload), recipient.subscriptionId] as const;
      }),
    );
    const sent = results.filter(([r]) => r === "sent").map(([, id]) => id);
    const gone = results.filter(([r]) => r === "gone").map(([, id]) => id);
    await recordPushResults(db, { sent, gone });
    return { sent: sent.length };
  } catch (error) {
    console.error("[push] failed", (error as Error).name);
    return { sent: 0 };
  }
}
