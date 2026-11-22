import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { answerToOffer, uniqueEmail, uniqueImei } from "./support/sell";

// Each test acts as a different visitor, so per-IP rate limits don't collide.
test.beforeEach(async ({ page }) => {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${octet()}, 10.0.0.${octet()}` });
});

test.describe("sell catalogue", () => {
  test("/sell lists brands and links to models", async ({ page }) => {
    await page.goto("/sell");
    await expect(page.getByRole("heading", { level: 1, name: "Sell your phone" })).toBeVisible();
    await page.getByRole("link", { name: "Samsung" }).click();
    await expect(page).toHaveURL(/\/sell\/samsung$/);
    await expect(page.getByRole("link", { name: /Galaxy S24/ })).toBeVisible();
    await page.getByRole("link", { name: /Galaxy S24/ }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Sell your Samsung Galaxy S24" }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("model pages are prerendered with metadata and breadcrumbs", async ({ page }) => {
    const response = await page.goto("/sell/google/pixel-9");
    expect(
      response?.headers()["x-nextjs-prerender"] ?? response?.headers()["x-nextjs-cache"],
    ).toBeTruthy();
    await expect(page).toHaveTitle("Sell your Google Pixel 9 | RefurbednUsed");
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Google");
  });

  test("search form shows results on /sell", async ({ page }) => {
    await page.goto("/sell");
    await page.getByRole("combobox").fill("galaxy");
    await page.getByRole("button", { name: "Get a quote" }).click();
    await expect(page).toHaveURL(/\/sell\?q=galaxy$/);
    await expect(page.getByRole("link", { name: /Galaxy S25 Ultra/ })).toHaveAttribute(
      "href",
      "/sell/samsung/galaxy-s25-ultra",
    );
  });

  // Streamed after the shell, so these are "soft" 404s: not-found page + noindex.
  test("unknown models show not found and aren't indexed", async ({ page }) => {
    await page.goto("/sell/apple/iphone-1");
    await expect(page.getByText("This page could not be found.")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  });
});

test.describe("sell flow", () => {
  test("instant offer, details, quote and tracking page", async ({ page }) => {
    await answerToOffer(page);

    await expect(page.getByRole("heading", { name: "Your instant offer" })).toBeFocused();
    await expect(page.getByTestId("offer-amount")).toHaveText("£220.00");
    await expect(page.getByText(/Locked for 14 days/)).toBeVisible();

    await page.getByRole("radio", { name: /^Drop it off in store/ }).check();
    await page.getByRole("radio", { name: /^FairTech, South Shields/ }).check();
    await page.getByRole("button", { name: "Accept and continue" }).click();

    await page.getByLabel("Full name").fill("Jo Bloggs");
    await page.getByLabel("Email").fill(uniqueEmail());
    await page.getByLabel("Mobile number").fill("07700 900123");
    await page.getByLabel("Address line 1").fill("1 Test Street");
    await page.getByLabel("Town or city").fill("South Shields");
    await page.getByLabel("Postcode").fill("ne33 1ht");
    await page.getByLabel("IMEI number").fill("490154203237517"); // bad check digit
    await page.getByLabel("Name on the account").fill("Jo Bloggs");
    await page.getByLabel("Sort code").fill("12-34-56");
    await page.getByLabel("Account number").fill("12345678");
    await page.getByRole("checkbox", { name: /I own this phone/ }).check();
    await page.getByRole("checkbox", { name: /Find My iPhone/ }).check();
    await page.getByRole("button", { name: /Accept £220.00/ }).click();

    // Server-side validation: error summary links to the field.
    const summary = page
      .getByRole("alert")
      .filter({ hasText: "Please check the highlighted details" });
    await expect(summary).toBeFocused();
    await expect(summary.getByRole("link", { name: /IMEI isn’t valid/ })).toBeVisible();
    await expect(page.getByLabel("IMEI number")).toHaveAttribute("aria-invalid", "true");

    await page.getByLabel("IMEI number").fill(uniqueImei());
    await page.getByRole("button", { name: /Accept £220.00/ }).click();

    await expect(page).toHaveURL(/\/sell\/track\/[\w-]{20,}$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Thanks, your quote is confirmed",
    );
    await expect(page.getByText(/^Reference RU-Q-[0-9A-Z]{6}$/)).toBeVisible();
    await expect(page.getByTestId("tracked-offer")).toHaveText("£220.00");
    await expect(page.getByText("FairTech, 2 King St, South Shields NE33 1HT")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  });

  test("declarations are required", async ({ page }) => {
    await answerToOffer(page);
    await page.getByRole("button", { name: "Accept and continue" }).click();
    await page.getByLabel("Full name").fill("Jo Bloggs");
    await page.getByRole("button", { name: /Accept £220.00/ }).click();
    const summary = page
      .getByRole("alert")
      .filter({ hasText: "Please check the highlighted details" });
    await expect(summary.getByRole("link", { name: /own this phone/ })).toBeVisible();
    await expect(summary.getByRole("link", { name: /Find My/ })).toBeVisible();
  });

  test("a faulty phone gets a lower offer", async ({ page }) => {
    await page.goto("/sell/apple/iphone-15");
    await page.getByRole("radio", { name: "128GB" }).check();
    await page.getByRole("radio", { name: "Black" }).check();
    await page.getByRole("radio", { name: "Unlocked" }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    for (const answer of [/^No, or something/, /^Cracked or faulty/, /^Like new/, /^85% or more/]) {
      await page.getByRole("radio", { name: answer }).check();
      await page.getByRole("button", { name: "Continue" }).click();
    }
    await page.getByRole("radio", { name: /^Yes, it works/ }).check();
    await page.getByRole("button", { name: "See my offer" }).click();
    await expect(page.getByTestId("offer-amount")).toHaveText("£65.00");
  });

  test("invalid tracking links show not found", async ({ page }) => {
    await page.goto("/sell/track/not-a-real-token-1234567890");
    await expect(page.getByText("This page could not be found.")).toBeVisible({ timeout: 15_000 });
  });

  test("the quote wizard has no WCAG 2.2 AA violations", async ({ page }) => {
    await page.goto("/sell/apple/iphone-15");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
