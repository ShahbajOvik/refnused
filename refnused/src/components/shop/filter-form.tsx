"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { parseShopFilters, serializeShopFilters } from "@refnused/database/lib/shop/filters";

/**
 * Progressive enhancement for the shop's GET form. Without JavaScript it
 * submits normally. With it:
 * - the URL is canonical (brand=apple,samsung instead of repeated keys),
 * - filters apply as soon as they change on wide screens (on small screens
 *   the filter panel has a "Show phones" button instead),
 * - results update in place, and are dimmed while loading.
 */
export function FilterForm({
  action,
  omit,
  stateKey,
  children,
  className,
}: {
  /** Listing path, e.g. /shop or /shop/apple. */
  action: string;
  /** Params the path already implies (brand on /shop/[brand]). */
  omit?: string[];
  /** Canonical query of the filters on screen; changes after each navigation. */
  stateKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const firstRender = useRef(true);
  // Small screens: the filter panel. Without JS it opens with #filters
  // (CSS :target); with JS we track it here, because :target doesn't
  // update when the URL changes through history.pushState.
  const [panelOpen, setPanelOpen] = useState(false);
  // Lets tests (and CSS, if needed) know the enhanced form is active.
  useEffect(() => {
    formRef.current?.setAttribute("data-ready", "");
  }, []);

  function openPanel(open: boolean) {
    setPanelOpen(open);
    const form = formRef.current;
    requestAnimationFrame(() => {
      const focusTarget = open
        ? form?.querySelector<HTMLElement>("[data-filter-panel]")
        : form?.querySelector<HTMLElement>('a[href="#filters"]');
      focusTarget?.focus();
    });
  }

  // The fields are uncontrolled (so the form works before hydration). After
  // a navigation (a removed chip, Back) their defaults are the new filters,
  // so reset() brings them in line without remounting and losing focus.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    formRef.current?.reset();
  }, [stateKey]);

  function apply(form: HTMLFormElement) {
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value === "string") params.append(key, value);
    }
    // Page isn't a form field, so any change goes back to page 1.
    const filters = parseShopFilters(params);
    const query = serializeShopFilters(filters, { omit });
    setPanelOpen(false);
    startTransition(() => router.push(query ? `${action}?${query}` : action, { scroll: false }));
  }

  return (
    <form
      ref={formRef}
      id="shop-filters"
      method="get"
      action={action}
      data-pending={pending || undefined}
      data-panel-open={panelOpen || undefined}
      aria-busy={pending || undefined}
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        apply(event.currentTarget);
      }}
      onClick={(event) => {
        const link = (event.target as HTMLElement).closest("a");
        if (link?.getAttribute("href") === "#filters") {
          event.preventDefault();
          openPanel(true);
        } else if (link?.hasAttribute("data-close-filters")) {
          event.preventDefault();
          openPanel(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && panelOpen) openPanel(false);
      }}
      onChange={(event) => {
        const target = event.target as HTMLElement;
        const inPanel = target.closest("[data-filter-panel]");
        const wide = window.matchMedia("(min-width: 64rem)").matches;
        // Number fields fire "change" when committed (blur or Enter), so
        // this never applies half-typed prices.
        if (!inPanel || wide) apply(event.currentTarget);
      }}
    >
      {children}
    </form>
  );
}
