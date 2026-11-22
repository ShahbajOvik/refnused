"use client";

import { useSyncExternalStore } from "react";

/*
 * One polite live region for the account area. Success messages go here
 * (not next to the form) because the form that sent them often disappears
 * when the page refreshes, e.g. "Make default" on the new default address.
 */

let message = "";
let counter = 0;
const listeners = new Set<() => void>();

export function announce(text: string) {
  // Re-announce identical messages by changing the snapshot.
  message = text;
  counter += 1;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function Announcer() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => `${counter}:${message}`,
    () => "0:",
  );
  const text = snapshot.slice(snapshot.indexOf(":") + 1);
  return (
    <p
      role="status"
      data-testid="account-announcer"
      className={
        text
          ? "mb-4 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm font-medium"
          : "sr-only"
      }
    >
      {text}
    </p>
  );
}
