/*
 * Install state shared by PwaRegister (which hears the browser's events
 * from the first page load) and InstallBanner (shown after a quote or an
 * order). Browser-only module state; no React context needed.
 */

/** Chromium's install prompt event (not in the DOM typings). */
export type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function setInstallPrompt(event: BeforeInstallPromptEvent | null) {
  deferred = event;
  emit();
}

export function markInstalled() {
  installed = true;
  deferred = null;
  emit();
}

export function getInstallPrompt() {
  return deferred;
}

export function isInstalled() {
  return installed;
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Running as an installed app (home screen / desktop window). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone, iPod or iPad (iPadOS reports itself as a Mac with touch). */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}
