"use client";

import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Group } from "three";

import { HERO_BASE_ROTATION, HERO_CAMERA, HERO_MODEL_URL } from "./config";
import { applyHeroLighting, normaliseModel } from "./scene-setup";
import { easeInOut, type HeroMotionState } from "./types";

/** Radians per second of the slow idle spin. */
const SPIN_SPEED = 0.25;

function Lighting() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => applyHeroLighting(gl, scene), [gl, scene]);
  return null;
}

/** Pointer position (or device tilt) in the range -1…1. */
function usePointerTarget() {
  const target = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    const onPointer = (e: PointerEvent) => {
      target.current.x = clamp((e.clientX / window.innerWidth) * 2 - 1);
      target.current.y = clamp((e.clientY / window.innerHeight) * 2 - 1);
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      target.current.x = clamp(e.gamma / 35);
      target.current.y = clamp((e.beta - 50) / 35);
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    // iOS needs a permission prompt for tilt; we don't ask, so it's pointer-only there.
    const needsPermission =
      typeof DeviceOrientationEvent !== "undefined" &&
      "requestPermission" in DeviceOrientationEvent;
    if (!needsPermission) window.addEventListener("deviceorientation", onTilt, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("deviceorientation", onTilt);
    };
  }, []);
  return target;
}

function Phones({ state, onReady }: { state: HeroMotionState; onReady: () => void }) {
  const { scene } = useGLTF(HERO_MODEL_URL);
  const [modelA, modelB] = useMemo(
    () => [normaliseModel(scene.clone(true)), normaliseModel(scene.clone(true))],
    [scene],
  );
  const a = useRef<Group>(null);
  const b = useRef<Group>(null);
  const pointerTarget = usePointerTarget();
  const pointer = useRef({ x: 0, y: 0 });
  const spin = useRef(0);
  const reported = useRef(false);
  const viewportWidth = useThree((s) => s.viewport.width);

  useFrame((_, delta) => {
    if (!a.current || !b.current) return;
    const ease = Math.min(1, delta * 3);
    pointer.current.x += (pointerTarget.current.x - pointer.current.x) * ease;
    pointer.current.y += (pointerTarget.current.y - pointer.current.y) * ease;
    spin.current += delta * SPIN_SPEED;

    const p = easeInOut(state.progress);
    const offset = state.spread * viewportWidth * p;
    const scale = 1 - 0.22 * p;
    const tiltX = HERO_BASE_ROTATION.x + pointer.current.y * 0.25;
    const turn = pointer.current.x * 0.5;

    a.current.position.x = -offset;
    a.current.rotation.set(tiltX, HERO_BASE_ROTATION.y + spin.current + turn, -0.07 * p);
    a.current.scale.setScalar(scale);

    // The second phone appears as the first one splits in two.
    b.current.visible = p > 0.002;
    b.current.position.x = offset;
    b.current.rotation.set(tiltX, -HERO_BASE_ROTATION.y - spin.current + turn, 0.07 * p);
    b.current.scale.setScalar(scale);

    if (!reported.current) {
      reported.current = true;
      onReady();
    }
  });

  return (
    <>
      <group ref={a}>
        <primitive object={modelA} />
      </group>
      <group ref={b} visible={false}>
        <primitive object={modelB} />
      </group>
    </>
  );
}

/** Live 3D hero. Loaded with next/dynamic only on capable devices. */
export default function HeroCanvas({
  state,
  onReady,
}: {
  state: HeroMotionState;
  onReady: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);

  // Stop rendering entirely when the hero is scrolled out of view.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(!!entry?.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={container} className="absolute inset-0" aria-hidden>
      <Canvas
        dpr={[1, 2]}
        frameloop={onScreen ? "always" : "never"}
        camera={{ fov: HERO_CAMERA.fov, position: HERO_CAMERA.position }}
        gl={{ alpha: true, antialias: true, powerPreference: "default" }}
        style={{ pointerEvents: "none" }}
      >
        <Lighting />
        <Suspense fallback={null}>
          <Phones state={state} onReady={onReady} />
        </Suspense>
      </Canvas>
    </div>
  );
}
