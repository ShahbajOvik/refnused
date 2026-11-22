/**
 * Renders the PWA images in public/ from the brand mark (src/app/icon.svg):
 *
 *   public/icons/icon-192.png, icon-512.png      app icons ("any")
 *   public/icons/maskable-192.png, -512.png      full-bleed, glyph in the safe zone
 *   public/icons/apple-touch-icon.png            180px, opaque (iOS home screen)
 *   public/icons/badge-96.png                    white glyph on transparent (Android status bar)
 *   public/icons/shortcut-*.png                  96px icons for the manifest shortcuts
 *
 *   npm run pwa:assets
 *
 * With --screenshots, also captures the install-dialog screenshots from a
 * running production build (PWA_BASE_URL, default http://localhost:3100):
 *
 *   public/screenshots/home-narrow.png, shop-narrow.png   1080×1920
 *   public/screenshots/home-wide.png                      1920×1080
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const iconsDir = join(root, "public/icons");
const shotsDir = join(root, "public/screenshots");
mkdirSync(iconsDir, { recursive: true });

const GREEN = "#0f7a63";
/** The phone-and-tick glyph from src/app/icon.svg, on a 32-unit grid. */
const GLYPH = `<rect x="10.5" y="6" width="11" height="20" rx="2.5" fill="none" stroke="#fff" stroke-width="2"/><path d="M13 14.5l2.2 2.2 4-4.2" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Scale the glyph about the centre. */
const scaled = (scale: number, glyph = GLYPH) =>
  `<g transform="translate(16 16) scale(${scale}) translate(-16 -16)">${glyph}</g>`;

const svg = (body: string) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`);

async function png(name: string, size: number, body: string) {
  await sharp(svg(body), { density: (72 * size) / 32 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(iconsDir, name));
  console.log(`public/icons/${name}`);
}

// "any": the rounded mark, as in the favicon.
for (const size of [192, 512]) {
  await png(
    `icon-${size}.png`,
    size,
    `<rect width="32" height="32" rx="8" fill="${GREEN}"/>${GLYPH}`,
  );
}
// Maskable: full-bleed, glyph kept inside the central 80% circle.
for (const size of [192, 512]) {
  await png(
    `maskable-${size}.png`,
    size,
    `<rect width="32" height="32" fill="${GREEN}"/>${scaled(0.72)}`,
  );
}
// iOS adds its own rounded corners and doesn't allow transparency.
await png(
  "apple-touch-icon.png",
  180,
  `<rect width="32" height="32" fill="${GREEN}"/>${scaled(0.85)}`,
);
// Badge: Android uses only the alpha channel.
await png("badge-96.png", 96, scaled(1.3));

/** Lucide glyphs (24-unit grid, already a dependency) for the shortcuts. */
const lucide = (inner: string) =>
  `<g transform="translate(6 6) scale(0.8333)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
const SHORTCUTS: Record<string, string> = {
  sell: lucide(
    '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  ),
  shop: lucide('<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>'),
  stores: lucide(
    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  ),
  account: lucide(
    '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  ),
};
for (const [name, glyph] of Object.entries(SHORTCUTS)) {
  await png(
    `shortcut-${name}.png`,
    96,
    `<rect width="32" height="32" rx="8" fill="${GREEN}"/>${glyph}`,
  );
}

if (process.argv.includes("--screenshots")) {
  const { chromium } = await import("@playwright/test");
  const base = process.env.PWA_BASE_URL ?? "http://localhost:3100";
  mkdirSync(shotsDir, { recursive: true });
  const browser = await chromium.launch();
  const shots = [
    { name: "home-narrow", path: "/", viewport: { width: 360, height: 640 }, scale: 3 },
    { name: "shop-narrow", path: "/shop", viewport: { width: 360, height: 640 }, scale: 3 },
    { name: "home-wide", path: "/", viewport: { width: 1280, height: 720 }, scale: 1.5 },
  ];
  for (const shot of shots) {
    const context = await browser.newContext({
      viewport: shot.viewport,
      deviceScaleFactor: shot.scale,
      reducedMotion: "reduce",
      colorScheme: "light",
      locale: "en-GB",
    });
    const page = await context.newPage();
    await page.goto(new URL(shot.path, base).href, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const file = join(shotsDir, `${shot.name}.png`);
    const buffer = await page.screenshot({ type: "png" });
    await sharp(buffer).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(file);
    console.log(`public/screenshots/${shot.name}.png`);
    await context.close();
  }
  await browser.close();
}
