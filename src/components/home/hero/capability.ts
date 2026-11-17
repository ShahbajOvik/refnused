/**
 * Decides whether the hero gets the live 3D scene or the static image.
 * The static image is the default; 3D is an enhancement for capable
 * devices only.
 */

export type DeviceSignals = {
  reducedMotion: boolean;
  saveData: boolean;
  /** Network Information API, e.g. "4g", "3g", "2g", "slow-2g". */
  effectiveType?: string;
  hardwareConcurrency?: number;
  /** Device Memory API, in GB (Chromium only). */
  deviceMemory?: number;
  webgl: "none" | "software" | "hardware";
};

export type HeroMode = "static" | "3d";

const SLOW_NETWORKS = new Set(["slow-2g", "2g", "3g"]);

export function chooseHeroMode(
  signals: DeviceSignals,
  options: { force3d?: boolean } = {},
): HeroMode {
  // Never override the user's own preferences.
  if (signals.reducedMotion || signals.saveData) return "static";
  if (signals.webgl === "none") return "static";
  if (options.force3d) return "3d";
  if (signals.webgl === "software") return "static";
  if (signals.effectiveType && SLOW_NETWORKS.has(signals.effectiveType)) return "static";
  if (signals.hardwareConcurrency !== undefined && signals.hardwareConcurrency < 4) return "static";
  if (signals.deviceMemory !== undefined && signals.deviceMemory < 4) return "static";
  return "3d";
}

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

function detectWebgl(): DeviceSignals["webgl"] {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ??
      canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return "none";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return SOFTWARE_RENDERER.test(renderer) ? "software" : "hardware";
  } catch {
    return "none";
  }
}

type NavigatorWithHints = Navigator & {
  connection?: { saveData?: boolean; effectiveType?: string };
  deviceMemory?: number;
};

/** Reads the signals in the browser. Call after hydration only. */
export function readDeviceSignals(): DeviceSignals {
  const nav = navigator as NavigatorWithHints;
  return {
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    saveData: nav.connection?.saveData === true,
    effectiveType: nav.connection?.effectiveType,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    webgl: detectWebgl(),
  };
}
