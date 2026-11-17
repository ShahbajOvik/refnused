"use client";

import { useInView } from "motion/react";
import { useEffect, useRef } from "react";

type AnimatedNumberProps = {
  value: number;
  /** Formats the in-between and final values, e.g. as GBP. */
  format?: "integer" | "gbp-whole";
  className?: string;
};

const formatters = {
  integer: new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }),
  "gbp-whole": new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }),
};

/**
 * Counts up from zero when scrolled into view. The final value is in the
 * server HTML and always available to screen readers; the count-up is
 * visual only and skipped for reduced motion.
 */
export function AnimatedNumber({ value, format = "integer", className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const formatter = formatters[format];
  const final = formatter.format(value);
  // Start from zero once JS is running (unless reduced motion), then count up
  // when visible. Written straight to the DOM so React never re-renders.
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!inView) {
      el.textContent = formatter.format(0);
      return;
    }
    let stop: (() => void) | undefined;
    let cancelled = false;
    void import("motion").then(({ animate }) => {
      if (cancelled) return;
      const controls = animate(0, value, {
        duration: 1.2,
        ease: [0.22, 1, 0.36, 1],
        onUpdate: (v) => {
          el.textContent = formatter.format(Math.round(v));
        },
      });
      stop = () => controls.stop();
    });
    return () => {
      cancelled = true;
      stop?.();
      el.textContent = final;
    };
  }, [inView, value, formatter, final]);

  return (
    <span className={className}>
      <span
        ref={ref}
        aria-hidden
        className="inline-block tabular-nums"
        style={{ minWidth: `${final.length}ch` }}
      >
        {final}
      </span>
      <span className="sr-only">{final}</span>
    </span>
  );
}
