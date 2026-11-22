import { createHash } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { createQuote } from "./support/sell";

/*
 * Security headers and the Content Security Policy (SECURITY.md,
 * src/lib/security/csp.ts), checked against the production build.
 */

test.beforeEach(async ({ page }) => {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${octet()}, 10.0.2.${octet()}` });
});

/** Records CSP violations reported by the page. */
async function watchCsp(page: Page) {
  const violations: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp: string[] }).__csp ??= [];
      (window as unknown as { __csp: string[] }).__csp.push(
        `${e.violatedDirective} ${e.blockedURI} ${e.sample}`,
      );
    });
  });
  page.on("console", (msg) => {
    if (/Content Security Policy|Refused to/i.test(msg.text())) violations.push(msg.text());
  });
  return async () => [
    ...violations,
    ...(await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])),
  ];
}

function directive(csp: string, name: string) {
  return csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
}

/**
 * Every script in the server's HTML carries this response's nonce, or (the
 * next-themes script) matches THEME_SCRIPT_HASH. Scripts added later by
 * trusted code are allowed by 'strict-dynamic' and checked via violations.
 */
async function expectNonceOnEveryScript(html: string, csp: string) {
  const scriptSrc = directive(csp, "script-src");
  const nonce = scriptSrc.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce, "nonce in CSP").toBeTruthy();
  const hashes = [...scriptSrc.matchAll(/'(sha256-[^']+)'/g)].map((m) => m[1]);
  const tags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(
    ([, attrs]) => !/type="application\/(ld\+)?json"/.test(attrs!),
  );
  expect(tags.length).toBeGreaterThan(0);
  const missing = [];
  for (const [, attrs, body] of tags) {
    if (attrs!.includes(`nonce="${nonce}"`)) continue;
    const hash = `sha256-${createHash("sha256").update(body!).digest("base64")}`;
    if (!attrs!.includes("src=") && hashes.includes(hash)) continue;
    missing.push(`${attrs} ${body!.slice(0, 60)}`);
  }
  expect(missing, "scripts in the HTML without the nonce").toEqual([]);
}

test("every response has the base security headers", async ({ request }) => {
  for (const path of [
    "/",
    "/shop",
    "/basket",
    "/sign-in",
    "/offline",
    "/api/models/search?q=iph",
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    const h = response.headers();
    expect(h["strict-transport-security"], path).toMatch(/max-age=63072000; includeSubDomains/);
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["permissions-policy"], path).toMatch(/geolocation=\(\)/);
    expect(h["x-powered-by"], path).toBeUndefined();
  }
});

test("public pages: static CSP, no violations", async ({ page }) => {
  const violations = await watchCsp(page);
  for (const path of ["/", "/shop", "/sell/apple/iphone-15", "/stores"]) {
    const response = await page.goto(path);
    const csp = response!.headers()["content-security-policy"];
    expect(csp, path).toMatch(/frame-ancestors 'none'/);
    expect(directive(csp, "script-src"), path).not.toMatch(/nonce|unsafe-eval/);
    expect(response!.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    await page.waitForLoadState("networkidle");
  }
  expect(await violations()).toEqual([]);
});

test("sensitive pages: a fresh nonce on every script, no violations", async ({ page }) => {
  const violations = await watchCsp(page);
  const nonces = new Set<string>();
  for (const path of ["/basket", "/sign-in", "/admin/sign-in", "/checkout"]) {
    const response = await page.goto(path);
    const csp = response!.headers()["content-security-policy"];
    expect(csp, path).toMatch(/'strict-dynamic'/);
    expect(csp, path).toMatch(/frame-ancestors 'none'/);
    await expectNonceOnEveryScript(await response!.text(), csp);
    nonces.add(directive(csp, "script-src").match(/'nonce-([^']+)'/)![1]!);
    await page.waitForLoadState("networkidle");
  }
  expect(nonces.size).toBe(4);
  expect(await violations()).toEqual([]);
});

test("secret-link pages render per request with a nonce and send no referrer", async ({ page }) => {
  test.setTimeout(120_000);
  const violations = await watchCsp(page);
  const trackPath = await createQuote(page);
  const response = await page.goto(trackPath);
  const headers = response!.headers();
  expect(headers["referrer-policy"]).toBe("no-referrer");
  await expectNonceOnEveryScript(await response!.text(), headers["content-security-policy"]!);
  await page.waitForLoadState("networkidle");
  expect(await violations()).toEqual([]);
});

test("Auth.js's direct magic-link endpoint is closed", async ({ request }) => {
  const csrf = await (await request.get("/api/auth/csrf")).json();
  const response = await request.post("/api/auth/signin/resend", {
    form: { email: "someone@example.co.uk", csrfToken: csrf.csrfToken },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(404);
  expect((await request.post("/api/staff-auth/signin/resend", { maxRedirects: 0 })).status()).toBe(
    404,
  );
});

test("admin uploads need a staff session (the origin check behind it is unit-tested)", async ({
  request,
}) => {
  const response = await request.post("/admin/upload", {
    headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    multipart: {
      kind: "product-photo",
      file: { name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") },
    },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(307);
  expect(response.headers()["location"]).toMatch(/\/admin\/sign-in/);
});
