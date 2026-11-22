"use client";

import { useSyncExternalStore } from "react";

import type { OpeningHours } from "@/db/schema/stores";
import { openStatus } from "@/lib/stores";
import { cn } from "@/lib/utils";

const MINUTE = 60_000;

function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, 15_000);
  return () => window.clearInterval(id);
}
const currentMinute = () => Math.floor(Date.now() / MINUTE);
const noMinute = () => null;

/**
 * "Open now · closes 5:30pm". Worked out in the browser so cached pages
 * stay correct; the server renders an empty line of the same height.
 */
export function OpenNow({ hours, className }: { hours: OpeningHours | null; className?: string }) {
  const minute = useSyncExternalStore(subscribe, currentMinute, noMinute);
  const status = minute === null ? null : openStatus(hours, new Date(minute * MINUTE));
  return (
    <p className={cn("flex min-h-6 items-center gap-2 text-sm font-medium", className)}>
      {status ? (
        <>
          <span
            aria-hidden
            className={cn(
              "size-2.5 rounded-full",
              status.open ? "bg-success" : "bg-muted-foreground/60",
            )}
          />
          {status.text}
        </>
      ) : null}
    </p>
  );
}
