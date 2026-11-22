"use client";

import dynamic from "next/dynamic";

/**
 * The toast container, loaded after the page is interactive so it isn't in
 * the initial JavaScript. Toasts only follow user actions, by which point
 * it has loaded.
 */
export const LazyToaster = dynamic(() => import("./sonner").then((mod) => mod.Toaster), {
  ssr: false,
});
