"use client";

import { RotateCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import { OFFLINE_FROM_KEY } from "./offline-retry";

/** Opens the page the customer was trying to reach again. */
export function RetryButton() {
  const retry = () => {
    let target: string | null = null;
    try {
      target = sessionStorage.getItem(OFFLINE_FROM_KEY);
    } catch {
      // Storage blocked: reload whatever is in the address bar.
    }
    const sameOrigin = target && new URL(target).origin === window.location.origin;
    if (sameOrigin && target !== window.location.href) window.location.assign(target!);
    else window.location.reload();
  };
  return (
    <Button onClick={retry}>
      <RotateCwIcon aria-hidden />
      Try again
    </Button>
  );
}
