"use client";

import { XIcon } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import {
  compareHref,
  MAX_COMPARE,
  setCompareSelection,
  useCompareSelection,
} from "./compare-store";

/** Bar at the bottom of the screen while phones are picked for comparison. */
export function CompareTray() {
  const selected = useCompareSelection();
  if (selected.length === 0) return null;

  return (
    <aside
      aria-label="Compare phones"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="page-container flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
        <p className="text-sm" role="status">
          <strong>{selected.length}</strong> of {MAX_COMPARE} phones picked to compare
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCompareSelection([])}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <XIcon className="size-4" aria-hidden /> Clear
          </button>
          <Link
            href={compareHref(selected)}
            className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {selected.length < 2 ? "Pick one more to compare" : "Compare now"}
          </Link>
        </div>
      </div>
    </aside>
  );
}

/** Makes the picked phones match a shared /compare link. */
export function SyncCompareSelection({ slugs }: { slugs: string[] }) {
  const key = slugs.join(",");
  useEffect(() => {
    setCompareSelection(key ? key.split(",") : []);
  }, [key]);
  return null;
}
