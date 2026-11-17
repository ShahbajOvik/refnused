/**
 * Renders SAMPLE unit photos from public/models/phone.glb into
 * public/media/sample/phone-{front,back,angle,side}.webp, for seeded
 * products in development. Real units use photos uploaded to R2.
 *
 *   npm run media:samples
 *
 * Uses Playwright's Chromium (software WebGL) and esbuild to bundle three.js.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { build } from "esbuild";
import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const SIZE = { width: 1200, height: 1500 };

/** Rotation (radians) of each view. */
const VIEWS = {
  front: { x: 0, y: 0 },
  back: { x: 0, y: Math.PI },
  angle: { x: 0.12, y: -0.6 },
  side: { x: 0, y: Math.PI / 2 },
};

const entry = `
  import { ACESFilmicToneMapping, Color, Group, PerspectiveCamera, SRGBColorSpace, Scene, WebGLRenderer } from "three";
  import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
  import { HERO_CAMERA } from "./src/components/home/hero/config.ts";
  import { applyHeroLighting, normaliseModel } from "./src/components/home/hero/scene-setup.ts";

  window.renderView = async (glbBase64, width, height, rotation) => {
    const canvas = document.querySelector("canvas");
    const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.outputColorSpace = SRGBColorSpace;
    const scene = new Scene();
    scene.background = new Color("#eef0f2");
    applyHeroLighting(renderer, scene);
    const camera = new PerspectiveCamera(HERO_CAMERA.fov, width / height, 0.1, 100);
    camera.position.set(...HERO_CAMERA.position);
    const bytes = Uint8Array.from(atob(glbBase64), (c) => c.charCodeAt(0));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer, "");
    const phone = new Group();
    phone.add(normaliseModel(gltf.scene));
    phone.rotation.set(rotation.x, rotation.y, 0);
    scene.add(phone);
    renderer.render(scene, camera);
    return canvas.toDataURL("image/png");
  };
`;

const bundle = await build({
  stdin: { contents: entry, resolveDir: root, loader: "ts" },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  logLevel: "error",
});

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const glb = readFileSync(`${root}public/models/phone.glb`).toString("base64");
  const outDir = `${root}public/media/sample`;
  mkdirSync(outDir, { recursive: true });
  for (const [name, rotation] of Object.entries(VIEWS)) {
    const page = await browser.newPage({ viewport: SIZE });
    await page.setContent(
      `<!doctype html><body style="margin:0"><canvas width="${SIZE.width}" height="${SIZE.height}"></canvas></body>`,
    );
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
    const dataUrl = await page.evaluate(
      ([data, w, h, r]) =>
        (window as unknown as { renderView: (...a: unknown[]) => Promise<string> }).renderView(
          data,
          w,
          h,
          r,
        ),
      [glb, SIZE.width, SIZE.height, rotation] as const,
    );
    await page.close();
    const webp = await sharp(Buffer.from(dataUrl.split(",")[1]!, "base64"))
      .webp({ quality: 80 })
      .toBuffer();
    const out = `${outDir}/phone-${name}.webp`;
    writeFileSync(out, webp);
    console.log(`Wrote ${out} (${Math.round(webp.length / 1024)} KB)`);
  }
} finally {
  await browser.close();
}
