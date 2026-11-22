import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { ADMIN_URL } from "../playwright.config";

/*
 * Route protection without a database: these requests carry no session
 * cookie, so nothing reaches the database. Signed-in flows (2FA, idle timeout,
 * roles) are covered by the Vitest integration tests against MySQL.
 */

test.describe("route protection", () => {
  test("/account sends signed-out visitors to sign in and back", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Faccount$/);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  });

  test(`/admin sends signed-out visitors to staff sign in`, async ({ page }) => {
    await page.goto(`${ADMIN_URL}/admin/staff`);
    await expect(page).toHaveURL(/\/admin\/sign-in\?callbackUrl=%2Fadmin%2Fstaff$/);
    await expect(page.getByRole("heading", { level: 1, name: "Staff sign in" })).toBeVisible();
  });

  test("a customer cookie does not open /admin", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "ru.session", value: "fake", url: baseURL! }]);
    await page.goto(`${ADMIN_URL}/admin`);
    await expect(page).toHaveURL(/\/admin\/sign-in/);
  });

  test("admin pages are not indexed or cached", async ({ page }) => {
    const response = await page.goto(`${ADMIN_URL}/admin/sign-in`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    expect(response?.status()).toBe(200);
  });

  test("ignores off-site callback URLs", async ({ page }) => {
    await page.goto("/sign-in?callbackUrl=https://evil.example");
    await expect(page.locator('input[name="callbackUrl"]').first()).toHaveValue("/account");
  });
});

test.describe("sign-in pages", () => {
  test("customer sign-in offers email and passkey", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in with a passkey" })).toBeVisible();
  });

  test("validates the email before sending", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill("not-an-email");
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    // Filter out Next.js's own (empty) route-announcer alert.
    await expect(page.getByRole("alert").filter({ hasText: "valid email address" })).toBeVisible();
  });

  test("explains why a staff member was signed out", async ({ page }) => {
    await page.goto(`${ADMIN_URL}/admin/sign-in?reason=idle`);
    await expect(
      page.getByText("You were signed out after 30 minutes without activity."),
    ).toBeVisible();
  });

  for (const path of ["/sign-in", `${ADMIN_URL}/admin/sign-in`]) {
    test(`${path} has no WCAG 2.2 AA violations`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations.map((v) => v.id)).toEqual([]);
    });
  }
});
