/**
 * Shared hero settings. Used by the live 3D scene and by
 * scripts/render-hero-poster.mts, so the static poster matches the first
 * frame of the 3D scene exactly.
 */
export const HERO_MODEL_URL = "/models/phone.glb";

export const HERO_CAMERA = { fov: 30, position: [0, 0, 3.4] as [number, number, number] };

/** Resting pose of the phone (radians). */
export const HERO_BASE_ROTATION = { x: 0.12, y: -0.5 };

/** Static poster rendered from the model (transparent PNG). */
export const HERO_POSTER = { src: "/images/hero-phone.png", width: 1200, height: 1500 };
