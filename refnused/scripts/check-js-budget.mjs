#!/usr/bin/env node
/**
 * Checks the initial JS budget (CLAUDE.md: < 200KB per page, gzipped).
 * Run after `next build`. Reads each prerendered page's HTML, sums the
 * gzipped size of the module scripts it loads (noModule polyfills are
 * skipped, as modern browsers never download them) and fails over budget.
 *
 * Usage: node scripts/check-js-budget.mjs [budgetKB]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET_KB = Number(process.argv[2] ?? 200);
const APP_DIR = ".next/server/app";

function findHtml(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return findHtml(path);
    return name.endsWith(".html") && !name.startsWith("_") ? [path] : [];
  });
}

const gzCache = new Map();
function gzSize(src) {
  if (!gzCache.has(src)) {
    const file = join(".next", src.replace(/^\/_next\//, ""));
    gzCache.set(src, gzipSync(readFileSync(file)).length);
  }
  return gzCache.get(src);
}

let failed = false;
for (const htmlFile of findHtml(APP_DIR).sort()) {
  const html = readFileSync(htmlFile, "utf8");
  const scripts = new Set(
    [...html.matchAll(/<script\b[^>]*>/g)]
      .map((m) => m[0])
      .filter((tag) => !/\bnoModule\b/i.test(tag))
      .map((tag) => tag.match(/src="([^"]+\.js)"/)?.[1])
      .filter(Boolean),
  );
  const totalKB = [...scripts].reduce((sum, src) => sum + gzSize(src), 0) / 1024;
  const route =
    "/" +
    relative(APP_DIR, htmlFile)
      .replace(/\.html$/, "")
      .replace(/^index$/, "");
  const over = totalKB > BUDGET_KB;
  failed ||= over;
  console.log(`${over ? "✗" : "✓"} ${route.padEnd(30)} ${totalKB.toFixed(1)} KB`);
}

if (failed) {
  console.error(`\nInitial JS budget of ${BUDGET_KB} KB exceeded.`);
  process.exit(1);
}
