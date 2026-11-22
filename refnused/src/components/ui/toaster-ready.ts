/*
 * The Toaster is loaded lazily (lazy-toaster.tsx), and sonner drops toasts
 * raised before it mounts. Code that toasts without a user action first
 * (e.g. "new version available") waits for this.
 */
let markReady: () => void;
const ready = new Promise<void>((resolve) => {
  markReady = resolve;
});

export function markToasterReady() {
  markReady();
}

export function whenToasterReady(): Promise<void> {
  return ready;
}
