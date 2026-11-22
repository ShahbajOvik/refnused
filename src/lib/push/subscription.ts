import { z } from "zod";

/*
 * What a browser sends when it subscribes to Web Push. Pure: safe on the
 * client and the server.
 *
 * The endpoint is a URL we POST to later, so only the browsers' own push
 * services are accepted. Anything else could point our server at an
 * internal or third-party address.
 */

const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com", // Chrome, Android, Samsung Internet, Opera
  "updates.push.services.mozilla.com", // Firefox
  "web.push.apple.com", // Safari (macOS, and iOS home-screen apps)
] as const;

/** Edge uses Windows Push Notification Services on regional hosts. */
const PUSH_SERVICE_SUFFIXES = [".notify.windows.com"] as const;

export function isKnownPushService(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return (
    (PUSH_SERVICE_HOSTS as readonly string[]).includes(host) ||
    PUSH_SERVICE_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length)
  );
}

const base64Url = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+={0,2}$/, "Not base64url");

/** `PushSubscription.toJSON()`. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(2048).refine(isKnownPushService, "Unsupported push service"),
  // A P-256 public key (65 bytes → 87 chars) and a 16-byte auth secret (22 chars).
  keys: z.object({
    p256dh: base64Url(80, 100),
    auth: base64Url(16, 32),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

const secretToken = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/);

/** What the customer asked for updates about. Quote and order links prove access. */
export const pushTopicInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("quote"), token: secretToken }),
  z.object({ kind: z.literal("order"), token: secretToken }),
  z.object({ kind: z.literal("price_alerts") }),
]);
export type PushTopicInput = z.infer<typeof pushTopicInputSchema>;
