"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { chooseHeroMode, readDeviceSignals, type HeroMode } from "./capability";
import { HERO_POSTER } from "@refnused/database/config/hero";
import type { HeroMotionState } from "./types";

// three.js, R3F and the model load only when 3D is actually used.
const HeroCanvas = dynamic(() => import("./hero-canvas"), { ssr: false });

const INTENT_EVENTS = ["pointermove", "pointerdown", "touchstart", "wheel", "scroll", "keydown"];

/**
 * Runs `fn` on the visitor's first sign of activity. None of these events
 * count towards INP, and visitors who never interact never pay for the code.
 */
function onFirstIntent(fn: () => void) {
  const run = () => {
    stop();
    fn();
  };
  const stop = () => INTENT_EVENTS.forEach((e) => window.removeEventListener(e, run));
  INTENT_EVENTS.forEach((e) => window.addEventListener(e, run, { passive: true, once: true }));
  return stop;
}

/** Runs `fn` when the browser is idle (after the hero has painted). */
function whenIdle(fn: () => void) {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(fn, { timeout: 2500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 300);
  return () => clearTimeout(id);
}

function Poster({ copy, preload }: { copy: "a" | "b"; preload?: boolean }) {
  return (
    <div
      data-hero-poster={copy}
      className={cn("absolute inset-0", copy === "b" && "invisible opacity-0")}
    >
      <Image
        src={HERO_POSTER.src}
        alt=""
        fill
        preload={preload}
        fetchPriority={preload ? "high" : undefined}
        sizes="(min-width: 1024px) 32vw, 60vw"
        className="object-contain"
      />
    </div>
  );
}

/**
 * Hero visual. Always renders the static poster first (fast LCP, works
 * everywhere). On capable devices it then swaps in the live 3D scene; on
 * low-end devices, Save-Data or reduced motion it stays static.
 * Add ?hero=3d to the URL to force 3D for testing.
 */
export function HeroVisual() {
  const stage = useRef<HTMLDivElement>(null);
  // One stable, mutable object shared with GSAP and the 3D scene (never re-renders).
  const [motionState] = useState<HeroMotionState>(() => ({ progress: 0, spread: 0.25 }));
  const [mode, setMode] = useState<HeroMode>("static");
  const [canvasReady, setCanvasReady] = useState(false);

  useEffect(() => {
    const signals = readDeviceSignals();
    const force3d = new URLSearchParams(window.location.search).get("hero") === "3d";
    const cleanups: (() => void)[] = [];
    let cancelled = false;

    // Heavy code (3D scene, GSAP) waits for the first interaction, then idle
    // time, so it never competes with the first paint or the first tap.
    const later = (fn: () => void) =>
      cleanups.push(force3d ? whenIdle(fn) : onFirstIntent(() => cleanups.push(whenIdle(fn))));

    if (chooseHeroMode(signals, { force3d }) === "3d") later(() => setMode("3d"));
    if (!signals.reducedMotion) {
      later(() => {
        if (!stage.current) return;
        void import("./hero-scroll")
          .then(({ setupHeroScroll }) => setupHeroScroll(stage.current!, motionState))
          .then((cleanup) => (cancelled ? cleanup() : cleanups.push(cleanup)));
      });
    }
    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, [motionState]);

  return (
    <div ref={stage} className="absolute inset-0" data-hero-mode={mode}>
      <div
        aria-hidden
        className="absolute inset-0 transition-opacity duration-700"
        style={{ opacity: canvasReady ? 0 : 1 }}
      >
        <Poster copy="a" preload />
        <Poster copy="b" />
      </div>
      {mode === "3d" ? (
        <HeroCanvas state={motionState} onReady={() => setCanvasReady(true)} />
      ) : null}
    </div>
  );
}
