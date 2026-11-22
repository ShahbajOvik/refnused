/**
 * Renders public/models/phone.glb to public/images/hero-phone.png with the
 * same camera, pose and lighting as the live hero scene. Run after
 * replacing the model:
 *
 *   npm run hero:poster
 *
 * Uses Playwright's Chromium (software WebGL) and esbuild to bundle three.js.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { build } from "esbuild";
import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const { HERO_POSTER } = await import("../src/components/home/hero/config");

const entry = `
  import { ACESFilmicToneMapping, PerspectiveCamera, SRGBColorSpace, Scene, WebGLRenderer } from "three";
  import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
  import { HERO_BASE_ROTATION, HERO_CAMERA } from "./src/components/home/hero/config.ts";
  import { applyHeroLighting, normaliseModel } from "./src/components/home/hero/scene-setup.ts";
  import { Group } from "three";

  window.renderPoster = async (glbBase64, width, height) => {
    const canvas = document.querySelector("canvas");
    const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.outputColorSpace = SRGBColorSpace;
    const scene = new Scene();
    applyHeroLighting(renderer, scene);
    const camera = new PerspectiveCamera(HERO_CAMERA.fov, width / height, 0.1, 100);
    camera.position.set(...HERO_CAMERA.position);
    const bytes = Uint8Array.from(atob(glbBase64), (c) => c.charCodeAt(0));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer, "");
    const phone = new Group();
    phone.add(normaliseModel(gltf.scene));
    phone.rotation.set(HERO_BASE_ROTATION.x, HERO_BASE_ROTATION.y, 0);
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
  const page = await browser.newPage({
    viewport: { width: HERO_POSTER.width, height: HERO_POSTER.height },
  });
  await page.setContent(
    `<!doctype html><body style="margin:0;background:transparent"><canvas width="${HERO_POSTER.width}" height="${HERO_POSTER.height}"></canvas></body>`,
  );
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
  const glb = readFileSync(`${root}public/models/phone.glb`).toString("base64");
  const dataUrl = await page.evaluate(
    ([data, w, h]) =>
      (window as unknown as { renderPoster: (...a: unknown[]) => Promise<string> }).renderPoster(
        data,
        w,
        h,
      ),
    [glb, HERO_POSTER.width, HERO_POSTER.height] as const,
  );
  const png = Buffer.from(dataUrl.split(",")[1]!, "base64");

  mkdirSync(`${root}public/images`, { recursive: true });
  const out = `${root}public${HERO_POSTER.src}`;
  const optimised = await sharp(png)
    .png({ compressionLevel: 9, effort: 10, palette: false })
    .toBuffer();
  writeFileSync(out, optimised);
  const { width, height } = await sharp(optimised).metadata();
  console.log(`Wrote ${out} (${width}×${height}, ${Math.round(optimised.length / 1024)} KB)`);
} finally {
  await browser.close();
}
