import AxeBuilder from "@axe-core/playwright";
import { devices, expect, test, type Page } from "@playwright/test";

import { createQuote } from "./support/sell";

/*
 * The PWA: manifest, service worker caching and offline page, the install
 * banner and push opt-in. Needs a production build (`npm run build` also
 * builds public/sw.js).
 */

test.beforeEach(async ({ page }) => {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${octet()}, 10.0.1.${octet()}` });
});

type Manifest = {
  name: string;
  start_url: string;
  display: string;
  icons: { src: string; sizes: string; purpose?: string }[];
  screenshots: { src: string; sizes: string; form_factor?: string }[];
  shortcuts: { name: string; url: string; icons: { src: string }[] }[];
};

test("the manifest is complete and every image exists", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute("content", /#/);

  const manifest = (await (await request.get(href!)).json()) as Manifest;
  expect(manifest).toMatchObject({ name: "RefurbednUsed", start_url: "/", display: "standalone" });
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", purpose: "any" }),
      expect.objectContaining({ sizes: "512x512", purpose: "any" }),
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
    ]),
  );
  expect(manifest.screenshots.map((s) => s.form_factor).sort()).toEqual([
    "narrow",
    "narrow",
    "wide",
  ]);
  expect(manifest.shortcuts.map((s) => s.url)).toEqual(["/sell", "/shop", "/stores", "/account"]);

  const images = [
    ...manifest.icons.map((i) => i.src),
    ...manifest.screenshots.map((s) => s.src),
    ...manifest.shortcuts.flatMap((s) => s.icons.map((i) => i.src)),
    "/icons/badge-96.png",
  ];
  for (const src of images) {
    const response = await request.get(src);
    expect(response.status(), src).toBe(200);
    expect(response.headers()["content-type"], src).toBe("image/png");
  }
});

/** Waits until the service worker is active and controls the page. */
async function controlledBySw(page: Page) {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
}

async function cachedUrls(page: Page) {
  return page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) urls.push(new URL(request.url).pathname);
    }
    return urls;
  });
}

test("works offline: cached product pages, an offline page for the rest", async ({
  page,
  context,
}) => {
  await controlledBySw(page);
  const sw = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL);
  expect(sw).toMatch(/\/sw\.js$/);

  // Visit a product page and the basket while online.
  await page.goto("/shop");
  const productHref = await page
    .locator('a[href^="/shop/"]')
    .evaluateAll((links) =>
      links
        .map((a) => a.getAttribute("href")!)
        .find((href) => /^\/shop\/(?!category\/)[a-z0-9-]+\/[a-z0-9-]+$/.test(href)),
    );
  expect(productHref).toBeTruthy();
  await page.goto(productHref!);
  const productTitle = await page.getByRole("heading", { level: 1 }).textContent();
  await page.goto("/basket");

  // The app shell is precached; personal pages never are.
  await expect.poll(() => cachedUrls(page)).toContain("/offline");
  const cached = await cachedUrls(page);
  expect(cached).toContain(productHref);
  for (const path of cached) {
    expect(path).not.toMatch(/^\/(basket|checkout|account|admin|orders|sell\/track|api)(\/|$)/);
  }

  await context.setOffline(true);
  try {
    // Product page: served from the cache.
    await page.goto(productHref!);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(productTitle!);

    // Basket (network-only) and an unvisited page: the offline page.
    for (const path of ["/basket", "/guides/not-visited-yet"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("You’re offline");
      const main = page.getByRole("main");
      await expect(main.getByRole("link", { name: /0191 380 0456/ })).toBeVisible();
      await expect(main.getByRole("link", { name: /0191 447 2311/ })).toBeVisible();
      await expect(main.getByText("77A Rudyerd Street")).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("the offline page has no WCAG 2.2 AA violations and isn't indexed", async ({ page }) => {
  const response = await page.goto("/offline");
  expect(response?.headers()["x-robots-tag"]).toMatch(/noindex/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("the service worker is never cached by the browser", async ({ request }) => {
  const response = await request.get("/sw.js");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toMatch(/no-cache/);
  expect(response.headers()["content-type"]).toMatch(/javascript/);
});

test("after a quote: push opt-in asks for permission only when pressed", async ({ page }) => {
  test.setTimeout(120_000);
  // Headless Chromium always reports "denied", so stand in for the browser's
  // permission: undecided until asked, and count every prompt.
  await page.addInitScript(() => {
    const w = window as unknown as { prompts: number };
    w.prompts = 0;
    let permission: NotificationPermission = "default";
    Object.defineProperty(Notification, "permission", { get: () => permission });
    Notification.requestPermission = async () => {
      w.prompts++;
      permission = "denied";
      return permission;
    };
  });
  await createQuote(page);
  const optIn = page.getByTestId("push-opt-in");
  await expect(optIn.getByRole("heading", { name: "Get updates on this device" })).toBeVisible();
  const button = optIn.getByRole("button", { name: "Turn on notifications" });
  await expect(button).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { prompts: number }).prompts)).toBe(0);

  await button.click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { prompts: number }).prompts))
    .toBe(1);
  // Saying no is handled: no button to nag with, and how to change it later.
  await expect(optIn.getByText(/Notifications are blocked for this site/)).toBeVisible();
});

test.describe("on iPhone", () => {
  test.use({
    userAgent: devices["iPhone 15"].userAgent,
    viewport: devices["iPhone 15"].viewport,
    isMobile: true,
    hasTouch: true,
  });

  test("the install banner explains Add to Home Screen after a quote", async ({ page }) => {
    test.setTimeout(120_000);
    await createQuote(page);
    const banner = page.getByTestId("install-banner");
    await expect(
      banner.getByRole("heading", { name: /Add RefurbednUsed to your home screen/ }),
    ).toBeVisible();
    await expect(
      banner.getByRole("list", { name: "How to add it on iPhone or iPad" }),
    ).toContainText("Add to Home Screen");
    const results = await new AxeBuilder({ page })
      .include('[data-testid="install-banner"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);

    await banner.getByRole("button", { name: /Not now/ }).click();
    await expect(banner).toBeHidden();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("install-banner")).toHaveCount(0);
  });
});
