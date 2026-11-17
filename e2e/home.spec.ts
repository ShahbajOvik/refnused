import { expect, test } from "@playwright/test";

// Never hit Google from tests.
test.beforeEach(async ({ page }) => {
  await page.route(/google\.com/, (route) => route.abort());
});

test.describe("home hero", () => {
  test("renders text and both paths straight away", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Sell your phone. Or buy one refurbished.",
    );
    await expect(page.getByRole("link", { name: /Sell your phone/ })).toHaveAttribute(
      "href",
      "/sell",
    );
    await expect(page.getByRole("link", { name: /Buy refurbished/ })).toHaveAttribute(
      "href",
      "/shop",
    );
    // Static poster first, preloaded for LCP.
    await expect(page.locator("[data-hero-poster='a'] img")).toBeVisible();
    await expect(page.locator('link[rel="preload"][as="image"]')).toHaveCount(1);
  });

  test("stays static on a software-rendered GPU (low-end)", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(3000);
    await expect(page.locator("[data-hero-mode]")).toHaveAttribute("data-hero-mode", "static");
    await expect(page.locator("[data-hero] canvas")).toHaveCount(0);
  });

  test("splits into two paths on scroll", async ({ page }) => {
    await page.goto("/");
    const posterB = page.locator("[data-hero-poster='b']");
    await expect(posterB).toBeHidden();
    // GSAP loads on the first interaction after hydration: keep nudging until
    // ScrollTrigger has taken control of the poster.
    await expect
      .poll(
        async () => {
          await page.mouse.move(100, 100);
          await page.mouse.wheel(0, 2);
          return page.getAttribute("[data-hero-poster='a']", "style");
        },
        { timeout: 15_000 },
      )
      .not.toBeNull();
    const sectionHeight = await page.locator("[data-hero]").evaluate((el) => el.scrollHeight);
    await page.mouse.wheel(0, sectionHeight * 0.5);
    await expect(posterB).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const a = document.querySelector("[data-hero-poster='a']")!.getBoundingClientRect();
          const b = document.querySelector("[data-hero-poster='b']")!.getBoundingClientRect();
          return b.left - a.left;
        }),
      )
      .toBeGreaterThan(80);
  });

  test("respects reduced motion: no sticky scroll, no 3D", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?hero=3d");
    const hero = page.locator("[data-hero]");
    const viewport = page.viewportSize()!;
    expect(await hero.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(
      viewport.height * 1.3,
    );
    await page.waitForTimeout(2500);
    await expect(page.locator("[data-hero] canvas")).toHaveCount(0);
  });

  test("loads the 3D scene when forced, then hides the poster", async ({ page, isMobile }) => {
    test.skip(isMobile, "One run is enough");
    await page.goto("/?hero=3d");
    // 3D waits for browser idle time; tight polling keeps the page busy and
    // delays it, so poll gently. The generous timeout covers the e2e server's
    // in-process database competing with parallel test browsers.
    test.setTimeout(90_000);
    await expect
      .poll(() => page.locator("[data-hero] canvas").count(), {
        intervals: [1000],
        timeout: 60_000,
      })
      .toBe(1);
    await expect(page.locator("[data-hero-mode]")).toHaveAttribute("data-hero-mode", "3d");
    await expect
      .poll(
        () =>
          page
            .locator("[data-hero-poster='a']")
            .evaluate((el) => getComputedStyle(el.parentElement!).opacity),
        {
          timeout: 15_000,
        },
      )
      .toBe("0");
  });
});

test.describe("quick quote", () => {
  test("searches and goes to the chosen model", async ({ page }) => {
    await page.route("**/api/models/search?**", (route) =>
      route.fulfill({
        json: {
          results: [
            {
              slug: "iphone-15",
              brandSlug: "apple",
              name: "iPhone 15",
              brand: "Apple",
              maxPricePence: 31000,
            },
            {
              slug: "iphone-13",
              brandSlug: "apple",
              name: "iPhone 13",
              brand: "Apple",
              maxPricePence: 18000,
            },
          ],
        },
      }),
    );
    await page.goto("/#quick-quote");
    const search = page.getByRole("combobox", { name: "Which phone are you selling?" });
    await search.fill("iphone");
    await expect(page.getByRole("option")).toHaveCount(2);
    await expect(page.getByRole("option").first()).toContainText("Up to £310");
    await search.press("ArrowDown");
    await search.press("Enter");
    await expect(page).toHaveURL(/\/sell\/apple\/iphone-15$/);
  });

  test("submits as a normal form", async ({ page }) => {
    await page.route("**/api/models/search?**", (route) =>
      route.fulfill({ json: { results: [] } }),
    );
    await page.goto("/#quick-quote");
    await page.getByRole("combobox").fill("nokia");
    await page.getByRole("button", { name: "Get a quote" }).click();
    await expect(page).toHaveURL(/\/sell\?q=nokia$/);
  });
});

test.describe("home sections", () => {
  test("has every section", async ({ page }) => {
    await page.goto("/");
    for (const name of [
      "What’s your phone worth?",
      "Sell in three simple steps",
      "Our price promise",
      "Just in",
      "Grades describe looks, not how it works",
      "Pop into a store",
      "What our customers say",
      "Questions, answered",
    ]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeAttached();
    }
  });

  test("price promise names competitors in text only", async ({ page }) => {
    await page.goto("/");
    const promise = page.locator("section", {
      has: page.getByRole("heading", { name: "Our price promise" }),
    });
    await expect(promise).toContainText("CeX, Mazuma Mobile or Back Market");
    await expect(promise.locator("img, svg:not([aria-hidden='true'])")).toHaveCount(0);
  });

  test("FAQ opens and has FAQPage structured data", async ({ page }) => {
    await page.goto("/");
    const question = page.getByText("Do you check if a phone is lost, stolen or on finance?");
    await question.scrollIntoViewIfNeeded();
    await question.click();
    await expect(page.getByText("checked against the CheckMEND database")).toBeVisible();
    const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(jsonLd.some((text) => text.includes('"FAQPage"'))).toBe(true);
  });

  test("maps only load when asked", async ({ page }) => {
    await page.goto("/#stores");
    await expect(page.locator("iframe")).toHaveCount(0);
    await page.getByRole("button", { name: "Show map" }).first().click();
    await expect(page.locator("iframe[title^='Map showing MetroTech']")).toBeAttached();
  });

  test("store cards have tap-to-call and directions", async ({ page }) => {
    await page.goto("/#stores");
    await expect(page.getByRole("link", { name: "Call 0191 380 0456" })).toHaveAttribute(
      "href",
      "tel:+441913800456",
    );
    await expect(page.getByRole("link", { name: /Directions to FairTech/ })).toHaveAttribute(
      "href",
      /google\.com\/maps\/dir/,
    );
  });
});
