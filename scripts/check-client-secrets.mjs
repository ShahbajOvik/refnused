#!/usr/bin/env node
/**
 * Fails if anything secret could reach the browser. Run after `npm run build`
 * with the same environment as the build:
 *
 *   npm run security:secrets
 *
 * Checks every file browsers can download (.next/static, public/, including
 * the service worker) for:
 * - the values of server-only environment variables that look secret;
 * - well-known secret formats (Stripe secret/restricted keys, webhook
 *   secrets, private keys, AWS-style keys, database URLs with passwords);
 * - published source maps;
 * and checks that the code only uses the expected NEXT_PUBLIC_ variables
 * (anything NEXT_PUBLIC_ is inlined into client bundles).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = [".next/static", "public"];

/** NEXT_PUBLIC_ variables that are meant to be public. */
const PUBLIC_ALLOWED = new Set([
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_MEDIA_BASE_URL",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_VERCEL_ENV",
]);

const SECRET_NAME = /SECRET|TOKEN|PASSWORD|PRIVATE|_KEY$|_KEYS$|DATABASE_URL|ACCESS_KEY|AUTH_/;

const PATTERNS = [
  [/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/, "Stripe secret or restricted key"],
  [/\bwhsec_[A-Za-z0-9]{10,}/, "Stripe webhook secret"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/postgres(?:ql)?:\/\/[^:\s"'/]+:[^@\s"']+@/, "database URL with password"],
  [/\bre_[A-Za-z0-9]{20,}/, "Resend API key"],
  [/\bsntrys_[A-Za-z0-9_]{20,}/, "Sentry auth token"],
];

function files(dir) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out = out.concat(files(path));
    else out.push(path);
  }
  return out;
}

const secretValues = Object.entries(process.env)
  .filter(([name, value]) => !name.startsWith("NEXT_PUBLIC_") && SECRET_NAME.test(name) && value)
  // FIELD_ENCRYPTION_KEYS is "id:key,id:key": check each key separately.
  .flatMap(([name, value]) =>
    value.split(",").map((part) => [name, part.includes(":") ? part.split(":").pop() : part]),
  )
  .filter(([, value]) => value && value.length >= 12);

const problems = [];
const assets = ROOTS.flatMap(files);
for (const file of assets) {
  if (file.endsWith(".map")) {
    problems.push(`${file}: source map is publicly served`);
    continue;
  }
  if (!/\.(?:js|mjs|css|html|json|txt|webmanifest)$/.test(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const [name, value] of secretValues) {
    if (text.includes(value)) problems.push(`${file}: contains the value of ${name}`);
  }
  for (const [pattern, label] of PATTERNS) {
    if (pattern.test(text)) problems.push(`${file}: looks like a ${label}`);
  }
}

const used = new Set();
for (const file of files("src")) {
  if (!/\.(?:ts|tsx|mts)$/.test(file)) continue;
  for (const [, name] of readFileSync(file, "utf8").matchAll(/\b(NEXT_PUBLIC_[A-Z0-9_]+)/g)) {
    used.add(name);
  }
}
for (const name of used) {
  if (!PUBLIC_ALLOWED.has(name)) {
    problems.push(`${name} is used in src/ but isn't on the public allow-list in this script`);
  }
}

if (!assets.length) {
  console.error("No build output found. Run `npm run build` first.");
  process.exit(1);
}
if (problems.length) {
  console.error(
    `✗ Possible secrets in client files:\n  ${problems.map((p) => relative(".", p)).join("\n  ")}`,
  );
  process.exit(1);
}
console.log(
  `✓ ${assets.length} client files checked against ${secretValues.length} secret values and ${PATTERNS.length} patterns; ${used.size} NEXT_PUBLIC_ variables, all expected.`,
);
