// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { THEME_INIT_SCRIPT } from "@refnused/database/lib/security/theme-script";

import {
  baseSecurityHeaders,
  buildCsp,
  createNonce,
  isSensitivePath,
  PERMISSIONS_POLICY,
  SENSITIVE_PREFIXES,
  THEME_SCRIPT_HASH,
} from "@refnused/database/lib/security/csp";

const PROD = { isDev: false, siteUrl: "https://www.example.co.uk" };

function directives(csp: string) {
  return Object.fromEntries(
    csp.split("; ").map((d) => {
      const [name, ...values] = d.split(" ");
      return [name, values];
    }),
  );
}

describe("isSensitivePath", () => {
  it("covers personal and payment pages by whole segment", () => {
    for (const path of [
      "/account",
      "/account/payout",
      "/basket",
      "/checkout",
      "/orders/abc",
      "/sell/track/abc",
      "/sell/track/abc/label",
      "/sign-in",
      "/sign-in/check-email",
    ]) {
      expect(isSensitivePath(path), path).toBe(true);
    }
    for (const path of [
      "/",
      "/account-deleted",
      "/sell",
      "/sell/apple/iphone-15",
      "/shop",
      "/basketball",
      // The admin is a separate app with its own strict policy.
      "/admin",
    ]) {
      expect(isSensitivePath(path), path).toBe(false);
    }
  });
});

describe("buildCsp", () => {
  it("strict policy: nonce + strict-dynamic, no self allow-list, no eval", () => {
    const d = directives(buildCsp({ ...PROD, nonce: "abc123" }));
    expect(d["script-src"]).toEqual(
      expect.arrayContaining(["'nonce-abc123'", "'strict-dynamic'", `'${THEME_SCRIPT_HASH}'`]),
    );
    expect(d["script-src"]).not.toContain("'unsafe-eval'");
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'self'"]);
    expect(d["form-action"]).toEqual(["'self'", "https://accounts.google.com"]);
    expect(d["frame-src"]).not.toContain("https://www.google.com");
    expect(d).toHaveProperty("upgrade-insecure-requests");
  });

  it("public policy: no nonce, named script hosts only", () => {
    const d = directives(buildCsp(PROD));
    expect(d["script-src"]).toEqual([
      "'self'",
      "'unsafe-inline'",
      "https://js.stripe.com",
      "https://*.js.stripe.com",
      "https://challenges.cloudflare.com",
    ]);
    expect(d["script-src"].join(" ")).not.toMatch(/nonce|unsafe-eval|https:$/);
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["frame-src"]).toContain("https://www.google.com");
  });

  it("allows the media domain and Sentry ingest host when configured", () => {
    const d = directives(
      buildCsp({
        ...PROD,
        mediaBaseUrl: "https://media.example.co.uk/",
        sentryDsn: "https://abc@o1.ingest.de.sentry.io/123",
      }),
    );
    expect(d["img-src"]).toContain("https://media.example.co.uk");
    expect(d["connect-src"]).toEqual(
      expect.arrayContaining(["https://media.example.co.uk", "https://o1.ingest.de.sentry.io"]),
    );
  });

  it("ignores malformed URLs", () => {
    expect(() => buildCsp({ ...PROD, mediaBaseUrl: "not a url", sentryDsn: "::" })).not.toThrow();
  });

  it("adds eval and websockets in development only, without upgrading http", () => {
    const dev = directives(buildCsp({ isDev: true, siteUrl: "http://localhost:3000", nonce: "n" }));
    expect(dev["script-src"]).toContain("'unsafe-eval'");
    expect(dev["connect-src"]).toContain("ws:");
    expect(dev).not.toHaveProperty("upgrade-insecure-requests");
    expect(directives(buildCsp({ ...PROD, siteUrl: "http://localhost:3100" }))).not.toHaveProperty(
      "upgrade-insecure-requests",
    );
  });
});

describe("theme script", () => {
  it("the allowed hash is the hash of the script the root layout renders", () => {
    const expected = `sha256-${createHash("sha256").update(THEME_INIT_SCRIPT).digest("base64")}`;
    expect(THEME_SCRIPT_HASH).toBe(expected);
    expect(readFileSync("src/app/layout.tsx", "utf8")).toMatch(/__html: THEME_INIT_SCRIPT/);
  });

  it("next-themes' own script is an inert data block", () => {
    const html = renderToString(<ThemeProvider>x</ThemeProvider>);
    const tags = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
    expect(tags.length).toBeGreaterThan(0);
    for (const attrs of tags) expect(attrs).toMatch(/type="application\/json"/);
  });
});

describe("headers", () => {
  it("sets HSTS, referrer, framing and permissions headers", () => {
    const headers = Object.fromEntries(baseSecurityHeaders().map((h) => [h.key, h.value]));
    expect(headers["Strict-Transport-Security"]).toMatch(/max-age=63072000; includeSubDomains/);
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(PERMISSIONS_POLICY).toMatch(/camera=\(self\)/);
    expect(PERMISSIONS_POLICY).toMatch(/geolocation=\(\)/);
    expect(PERMISSIONS_POLICY).toMatch(/microphone=\(\)/);
  });

  it("makes unpredictable nonces", () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(a);
  });
});

describe("sensitive routes are wired up", () => {
  const proxy = readFileSync("src/proxy.ts", "utf8");
  const matcher = proxy.slice(proxy.indexOf("export const config"));

  for (const prefix of SENSITIVE_PREFIXES) {
    it(`${prefix}: proxy sets the nonce CSP and the layout renders per request`, () => {
      expect(matcher).toContain(`"${prefix}"`.replace(/"$/, ""));
      const layout = `src/app/(site)${prefix}/layout.tsx`;
      const source = readFileSync(layout, "utf8");
      expect(source).toMatch(/export const instant = false/);
      expect(source).toMatch(/await renderPerRequest\(\)/);
    });
  }
});
