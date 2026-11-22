"use client";

import { useEffect } from "react";

import { whenToasterReady } from "@/components/ui/toaster-ready";

import { markInstalled, setInstallPrompt, type BeforeInstallPromptEvent } from "./install-store";

/**
 * Registers the service worker (public/sw.js, production builds only) once
 * the page has loaded, offers new versions with a toast, and keeps the
 * browser's install prompt for InstallBanner. Renders nothing.
 *
 * @serwist/window and sonner are loaded on demand, so they aren't part of
 * the initial JavaScript.
 */
export function PwaRegister() {
  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      // Don't let the browser show its own prompt: we offer it after a
      // quote or an order, when installing is useful.
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", markInstalled);

    let cancelled = false;
    const register = async () => {
      if (cancelled || process.env.NODE_ENV !== "production") return;
      if (!("serviceWorker" in navigator)) return;
      const { Serwist } = await import("@serwist/window");
      const sw = new Serwist("/sw.js", { scope: "/", type: "classic", updateViaCache: "none" });
      sw.addEventListener("waiting", () => void offerUpdate(sw));
      await sw.register().catch(() => undefined);
    };
    if (document.readyState === "complete") void register();
    else window.addEventListener("load", register, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", markInstalled);
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}

type SerwistWindow = InstanceType<typeof import("@serwist/window").Serwist>;

/** A new version is installed and waiting: let the customer choose when to switch. */
async function offerUpdate(sw: SerwistWindow) {
  const [{ toast }] = await Promise.all([import("sonner"), whenToasterReady()]);
  toast("A new version of the site is available.", {
    id: "sw-update",
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: "Refresh",
      onClick: () => {
        sw.addEventListener("controlling", () => window.location.reload());
        sw.messageSkipWaiting();
      },
    },
  });
}
