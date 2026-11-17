"use client";

import { CheckIcon, PlusIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { MAX_COMPARE, toggleCompare, useCompareSelection } from "./compare-store";

/** Adds a phone to (or removes it from) the comparison. */
export function CompareToggle({
  slug,
  name,
  className,
}: {
  slug: string;
  /** Used in the accessible name, e.g. "iPhone 15, 128GB, Black". */
  name: string;
  className?: string;
}) {
  const selected = useCompareSelection();
  const isSelected = selected.includes(slug);
  const isFull = !isSelected && selected.length >= MAX_COMPARE;

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={`Compare ${name}`}
      aria-disabled={isFull || undefined}
      title={isFull ? `You can compare up to ${MAX_COMPARE} phones` : undefined}
      onClick={() => !isFull && toggleCompare(slug)}
      className={cn(
        "relative z-10 inline-flex min-h-9 items-center gap-1.5 rounded-full border bg-background/90 px-3 text-xs font-medium transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground",
        className,
      )}
    >
      {isSelected ? (
        <CheckIcon className="size-3.5" aria-hidden />
      ) : (
        <PlusIcon className="size-3.5" aria-hidden />
      )}
      Compare
    </button>
  );
}
