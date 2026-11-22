/**
 * Mutable state shared between the scroll timeline (GSAP) and the 3D scene.
 * Written by ScrollTrigger, read every frame by the scene. A plain object,
 * not React state, so scrolling never causes React re-renders.
 */
export type HeroMotionState = {
  /** 0 at the top of the hero, 1 when the split is complete. */
  progress: number;
  /** How far each phone travels sideways, as a fraction of the stage width. */
  spread: number;
};

/** Same curve as GSAP's "power2.inOut", so 2D and 3D move together. */
export function easeInOut(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
}
