/**
 * Builds the service worker (src/sw/sw.ts) into public/sw.js. Runs after
 * `next build` (see the "build" script), because the precache list comes
 * from the build output:
 *
 * - the app shell: /offline, plus the CSS, fonts and scripts its
 *   prerendered HTML loads (the same chunks every page shares);
 * - the icons in public/icons.
 *
 * Everything else is cached at runtime (src/lib/pwa/cache-rules.ts), so
 * heavy chunks such as the 3D viewer are only stored once they're used.
 *
 *   npm run build:sw
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { getManifest, type ManifestEntry } from "@serwist/build";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const nextDir = join(root, ".next");
const offlineHtmlPath = join(nextDir, "server/app/offline.html");

if (!existsSync(offlineHtmlPath)) {
  throw new Error(
    "No prerendered /offline page in .next. Run `next build` first, and keep /offline static.",
  );
}

const buildId = readFileSync(join(nextDir, "BUILD_ID"), "utf8").trim();
const offlineHtml = readFileSync(offlineHtmlPath, "utf8");

/** Build assets (/_next/static/…) the offline page loads. */
function shellAssets(html: string): string[] {
  const urls = new Set<string>();
  for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/g)) {
    if (/\bnoModule\b/i.test(tag)) continue;
    const src = tag.match(/\s(?:src|href)="(\/_next\/static\/[^"?#]+)"/)?.[1];
    if (src && /\.(?:js|css|woff2)$/.test(src)) urls.add(src);
  }
  return [...urls].sort();
}

const shell = shellAssets(offlineHtml);
if (!shell.some((u) => u.endsWith(".css")) || !shell.some((u) => u.endsWith(".js"))) {
  throw new Error("Couldn't find the app shell's CSS and scripts in offline.html");
}

const staticManifest = await getManifest({
  globDirectory: nextDir,
  globPatterns: shell.map((u) => u.replace(/^\/_next\//, "")),
  modifyURLPrefix: { "static/": "/_next/static/" },
  // Hashed file names: no revision needed.
  dontCacheBustURLsMatching: /^\/_next\/static\//,
  maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
});

const publicManifest = await getManifest({
  globDirectory: join(root, "public"),
  globPatterns: ["icons/*.png"],
  modifyURLPrefix: { "icons/": "/icons/" },
});

const revision = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

const entries: ManifestEntry[] = [
  { url: "/offline", revision: revision(offlineHtml) },
  { url: "/manifest.webmanifest", revision: buildId },
  ...(staticManifest.manifestEntries ?? []),
  ...(publicManifest.manifestEntries ?? []),
];
for (const warning of [...staticManifest.warnings, ...publicManifest.warnings]) {
  console.warn(`[sw] ${warning}`);
}

/** Cross-origin image hosts the worker may cache (R2 media domain, Sanity CDN). */
const imageOrigins = ["https://cdn.sanity.io"];
const mediaBase = process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
if (mediaBase) imageOrigins.push(new URL(mediaBase).origin);

const result = await build({
  entryPoints: [join(root, "src/sw/sw.ts")],
  outfile: join(root, "public/sw.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome109", "safari16.4", "firefox115", "edge109"],
  minify: true,
  sourcemap: false,
  legalComments: "none",
  define: {
    "self.__SW_MANIFEST": JSON.stringify(entries),
    __IMAGE_ORIGINS__: JSON.stringify(imageOrigins),
    "process.env.NODE_ENV": '"production"',
  },
  banner: { js: `/* RefurbednUsed service worker, build ${buildId} */` },
  write: false,
});

const [output] = result.outputFiles;
writeFileSync(output!.path, output!.contents);
const kb = (output!.contents.byteLength / 1024).toFixed(1);
const shellKb =
  shell.reduce(
    (sum, u) => sum + readFileSync(join(nextDir, u.replace(/^\/_next\//, ""))).length,
    0,
  ) / 1024;
console.log(
  `[sw] public/sw.js ${kb} KB, ${entries.length} precached files (app shell ${shellKb.toFixed(0)} KB)`,
);
