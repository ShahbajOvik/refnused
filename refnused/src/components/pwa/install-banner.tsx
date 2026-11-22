"use client";

import { ShareIcon, SquarePlusIcon, XIcon } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

import {
  getInstallPrompt,
  isInstalled,
  isIos,
  isStandalone,
  subscribeInstall,
} from "./install-store";

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_DAYS = 30;

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/**
 * "Add RefurbednUsed to your home screen", shown after a quote or an order,
 * when coming back to track it is likely. Uses the browser's install prompt
 * where there is one (Chrome, Edge, Samsung Internet), and step-by-step
 * instructions on iPhone and iPad, where installing is done from the Share
 * menu. Hidden when already installed or dismissed in the last 30 days.
 *
 * Put it at the end of the page's content: it appears after hydration, and
 * nothing below it should move.
 */
export function InstallBanner({ context }: { context: "quote" | "order" }) {
  const prompt = useSyncExternalStore(subscribeInstall, getInstallPrompt, () => null);
  const installed = useSyncExternalStore(subscribeInstall, isInstalled, () => false);
  const [env, setEnv] = useState<{ ios: boolean; hidden: boolean } | null>(null);

  useEffect(() => {
    // Browser-only checks; the server render shows nothing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnv({ ios: isIos(), hidden: isStandalone() || dismissedRecently() });
  }, []);

  if (!env || env.hidden || installed) return null;
  if (!prompt && !env.ios) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Private browsing: just hide it for now.
    }
    setEnv({ ...env, hidden: true });
  };

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "dismissed") dismiss();
  };

  const what = context === "quote" ? "trade-in" : "order";

  return (
    <section
      aria-labelledby="install-heading"
      className="relative mt-10 flex gap-4 rounded-2xl border bg-card p-5 pr-14"
      data-testid="install-banner"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static icon */}
      <img
        src="/icons/icon-192.png"
        alt=""
        width={48}
        height={48}
        className="size-12 shrink-0 rounded-xl"
      />
      <div className="flex flex-col gap-2">
        <h2 id="install-heading" className="text-lg font-semibold">
          Add RefurbednUsed to your home screen
        </h2>
        <p className="text-muted-foreground">
          Check your {what} in one tap, and see our store details even when you’re offline.
        </p>
        {prompt ? (
          <div>
            <Button onClick={install}>Install the app</Button>
          </div>
        ) : (
          <ol
            className="flex list-decimal flex-col gap-1 pl-5"
            aria-label="How to add it on iPhone or iPad"
          >
            <li>
              Tap the Share button{" "}
              <ShareIcon className="inline size-4 align-text-bottom text-primary" aria-hidden /> in
              your browser’s toolbar.
            </li>
            <li>
              Choose <strong>Add to Home Screen</strong>{" "}
              <SquarePlusIcon
                className="inline size-4 align-text-bottom text-primary"
                aria-hidden
              />
              . You may need to scroll down the list.
            </li>
            <li>
              Tap <strong>Add</strong>.
            </li>
          </ol>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={dismiss}
        className="absolute top-3 right-3"
        aria-label="Not now: hide this suggestion"
      >
        <XIcon aria-hidden />
      </Button>
    </section>
  );
}
