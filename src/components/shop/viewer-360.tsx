"use client";

import { OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RotateCcwIcon, RotateCwIcon, Undo2Icon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Group } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { HERO_CAMERA } from "@/components/home/hero/config";
import { applyHeroLighting, normaliseModel } from "@/components/home/hero/scene-setup";

/** Turn per button press (45°). */
const STEP = Math.PI / 4;
const MIN_SCALE = 0.7;
const MAX_SCALE = 1.6;

type View = { turn: number; scale: number };

function Lighting() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => applyHeroLighting(gl, scene), [gl, scene]);
  return null;
}

function Phone({ url, view, instant }: { url: string; view: View; instant: boolean }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => normaliseModel(scene.clone(true)), [scene]);
  const group = useRef<Group>(null);

  // Ease towards the button-driven pose (or jump, with reduced motion).
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const t = instant ? 1 : Math.min(1, delta * 8);
    g.rotation.y += (view.turn - g.rotation.y) * t;
    const s = g.scale.x + (view.scale - g.scale.x) * t;
    g.scale.setScalar(s);
  });

  return (
    <group ref={group}>
      <primitive object={model} />
    </group>
  );
}

/**
 * 360° viewer: drag to spin, or use the buttons (a single-pointer
 * alternative to dragging and pinching, WCAG 2.5.1 / 2.5.7). Auto-rotates
 * until touched, except with reduced motion.
 */
export default function Viewer360({
  modelUrl,
  label,
  reducedMotion,
}: {
  modelUrl: string;
  label: string;
  reducedMotion: boolean;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const [view, setView] = useState<View>({ turn: 0, scale: 1 });
  const [autoRotate, setAutoRotate] = useState(!reducedMotion);

  const update = (change: (v: View) => View) => {
    setAutoRotate(false);
    setView(change);
  };

  const buttonClass =
    "inline-flex size-11 items-center justify-center rounded-lg border bg-background hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50";

  return (
    <div className="flex h-full flex-col">
      <div
        role="img"
        aria-label={`${label}. Drag to turn it, or use the buttons below.`}
        className="relative flex-1 touch-none"
      >
        <Canvas
          dpr={[1, 2]}
          camera={{ fov: HERO_CAMERA.fov, position: HERO_CAMERA.position }}
          gl={{ antialias: true, powerPreference: "default" }}
        >
          <Lighting />
          <Suspense fallback={null}>
            <Phone url={modelUrl} view={view} instant={reducedMotion} />
          </Suspense>
          <OrbitControls
            ref={controls}
            enablePan={false}
            enableZoom
            minDistance={2}
            maxDistance={6}
            autoRotate={autoRotate}
            autoRotateSpeed={1.5}
            enableDamping={!reducedMotion}
            onStart={() => setAutoRotate(false)}
          />
        </Canvas>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 border-t p-3">
        <button
          type="button"
          className={buttonClass}
          aria-label="Turn left"
          onClick={() => update((v) => ({ ...v, turn: v.turn - STEP }))}
        >
          <RotateCcwIcon className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          className={buttonClass}
          aria-label="Turn right"
          onClick={() => update((v) => ({ ...v, turn: v.turn + STEP }))}
        >
          <RotateCwIcon className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          className={buttonClass}
          aria-label="Zoom out"
          disabled={view.scale <= MIN_SCALE}
          onClick={() => update((v) => ({ ...v, scale: Math.max(MIN_SCALE, v.scale - 0.15) }))}
        >
          <ZoomOutIcon className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          className={buttonClass}
          aria-label="Zoom in"
          disabled={view.scale >= MAX_SCALE}
          onClick={() => update((v) => ({ ...v, scale: Math.min(MAX_SCALE, v.scale + 0.15) }))}
        >
          <ZoomInIcon className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          className={`${buttonClass} w-auto gap-1.5 px-3 text-sm`}
          onClick={() => {
            controls.current?.reset();
            update(() => ({ turn: 0, scale: 1 }));
          }}
        >
          <Undo2Icon className="size-4" aria-hidden /> Reset
        </button>
      </div>
    </div>
  );
}
