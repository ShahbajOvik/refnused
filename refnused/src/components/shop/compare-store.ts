"use client";

import { useSyncExternalStore } from "react";

import { MAX_COMPARE_ITEMS } from "@/lib/shop/compare-limit";

/*
 * The phones picked for /compare (up to 3), kept in this browser only.
 * The compare page itself reads the URL, so a comparison can be shared.
 */

export const MAX_COMPARE = MAX_COMPARE_ITEMS;
const KEY = "ru:compare";
const EMPTY: string[] = [];
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: string[] } = { raw: null, value: EMPTY };

function read(): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Storage blocked (private mode): fall back to memory.
    return cache.value;
  }
  if (raw === cache.raw) return cache.value;
  let value = EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    if (Array.isArray(parsed)) {
      value = parsed
        .filter((s): s is string => typeof s === "string" && /^[a-z0-9-]{1,120}$/.test(s))
        .slice(0, MAX_COMPARE);
    }
  } catch {
    value = EMPTY;
  }
  cache = { raw, value };
  return value;
}

function write(value: string[]) {
  const next = value.slice(0, MAX_COMPARE);
  const raw = JSON.stringify(next);
  cache = { raw, value: next };
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    // Memory only.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCompareSelection() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function toggleCompare(slug: string) {
  const current = read();
  if (current.includes(slug)) write(current.filter((s) => s !== slug));
  else if (current.length < MAX_COMPARE) write([...current, slug]);
}

export function setCompareSelection(slugs: string[]) {
  write(slugs);
}

export function compareHref(slugs: string[]) {
  return slugs.length ? `/compare?items=${slugs.join(",")}` : "/compare";
}
