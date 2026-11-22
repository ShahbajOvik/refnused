"use client";

import { BellIcon, BellOffIcon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { pushStatusAction, subscribePushAction, unsubscribePushAction } from "@/lib/push/actions";
import type { PushTopicInput } from "@refnused/database/lib/push/subscription";

import { isIos, isStandalone } from "./install-store";

type State = "checking" | "unsupported" | "ios-install-first" | "blocked" | "off" | "on";

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** The registration, without waiting forever when no worker is installed (e.g. development). */
async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ]);
}

/**
 * "Get updates on this device" for a quote, an order or price alerts.
 * Permission is only asked for when the button is pressed, never on load.
 * Push is extra: emails and texts are still sent.
 */
export function PushOptIn({
  topic,
  vapidPublicKey,
  heading,
  description,
  headingLevel = 2,
}: {
  topic: PushTopicInput;
  /** NEXT_PUBLIC_VAPID_PUBLIC_KEY, passed from the server. Unset: nothing is shown. */
  vapidPublicKey: string | undefined;
  heading: string;
  description: string;
  headingLevel?: 2 | 3;
}) {
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const topicKey = JSON.stringify(topic);

  useEffect(() => {
    let cancelled = false;
    const set = (next: State) => !cancelled && setState(next);
    (async () => {
      const supported =
        Boolean(vapidPublicKey) &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (!supported) {
        // iPhone and iPad only offer push to apps added to the home screen.
        return set(
          isIos() && !isStandalone() && vapidPublicKey ? "ios-install-first" : "unsupported",
        );
      }
      if (Notification.permission === "denied") return set("blocked");
      if (Notification.permission !== "granted") return set("off");
      // Already allowed: check, without prompting, whether this topic is on.
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) return set("off");
      const on = await pushStatusAction({
        endpoint: subscription.endpoint,
        topic: JSON.parse(topicKey),
      }).catch(() => false);
      set(on ? "on" : "off");
    })();
    return () => {
      cancelled = true;
    };
  }, [topicKey, vapidPublicKey]);

  if (state === "checking" || state === "unsupported") return null;

  const turnOn = () =>
    startTransition(async () => {
      setMessage("");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const registration = await getRegistration();
      if (!registration) {
        setMessage("Couldn’t turn on notifications. Refresh the page and try again.");
        return;
      }
      try {
        const subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToBytes(vapidPublicKey!),
          }));
        const result = await subscribePushAction({ subscription: subscription.toJSON(), topic });
        if (result.ok) {
          setState("on");
          setMessage("Done. We’ll send updates to this device.");
        } else {
          setMessage(result.error);
        }
      } catch {
        setMessage("Couldn’t turn on notifications. Refresh the page and try again.");
      }
    });

  const turnOff = () =>
    startTransition(async () => {
      setMessage("");
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) {
        setState("off");
        return;
      }
      const result = await unsubscribePushAction({ endpoint: subscription.endpoint, topic });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      // Nothing else is followed on this device: stop the subscription too.
      if (result.remaining === 0) await subscription.unsubscribe().catch(() => undefined);
      setState("off");
      setMessage("Notifications for this are off.");
    });

  const Heading = `h${headingLevel}` as const;
  return (
    <section
      aria-labelledby={`push-${topic.kind}-heading`}
      className="mt-8 rounded-2xl border p-5"
      data-testid="push-opt-in"
    >
      <Heading id={`push-${topic.kind}-heading`} className="flex items-center gap-2 font-semibold">
        <BellIcon className="size-4 text-primary" aria-hidden /> {heading}
      </Heading>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {state === "off" ? (
          <Button onClick={turnOn} disabled={pending} variant="outline">
            <BellIcon aria-hidden />
            {pending ? "Turning on…" : "Turn on notifications"}
          </Button>
        ) : state === "on" ? (
          <Button onClick={turnOff} disabled={pending} variant="ghost">
            <BellOffIcon aria-hidden />
            {pending ? "Turning off…" : "Turn off notifications"}
          </Button>
        ) : state === "blocked" ? (
          <p className="text-sm">
            Notifications are blocked for this site. You can allow them in your browser’s site
            settings.
          </p>
        ) : (
          <p className="text-sm">
            On iPhone and iPad, add RefurbednUsed to your Home Screen first (Share, then Add to Home
            Screen), then open it from there to turn on notifications.
          </p>
        )}
        <p role="status" className="text-sm text-muted-foreground">
          {state === "on" && !message ? "Notifications are on for this device." : message}
        </p>
      </div>
    </section>
  );
}
