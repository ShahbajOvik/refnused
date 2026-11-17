import { expect, test } from "@playwright/test";

test.describe("site layout", () => {
  test("skip link moves focus to the main content", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await skip.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("header stays visible after scrolling", async ({ page }) => {
    await page.goto("/styleguide");
    await page.mouse.wheel(0, 3000);
    await expect(page.getByRole("banner")).toBeInViewport();
  });

  test("footer lists stores with tap-to-call links", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByText("77A Rudyerd Street")).toBeVisible();
    await expect(footer.getByText("NE33 1HT")).toBeVisible();
    await expect(footer.locator('a[href="tel:+441913800456"]')).toBeVisible();
    await expect(footer.locator('a[href="tel:+441914472311"]')).toBeVisible();
    await expect(footer.getByRole("navigation", { name: "Legal" })).toBeVisible();
  });

  test("theme toggle switches to dark mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.getByRole("button", { name: "Toggle dark mode" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});

test.describe("desktop header", () => {
  test.skip(({ isMobile }) => isMobile, "Desktop only");

  test("shows main nav, account and basket", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" });
    for (const label of ["Sell", "Shop", "Stores", "Help"]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
    const header = page.getByRole("banner");
    await expect(header.getByRole("link", { name: "Account" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Basket" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Open menu" })).toBeHidden();
  });
});

test.describe("mobile menu", () => {
  test.skip(({ isMobile }) => !isMobile, "Mobile only");

  test("opens, lists sections and closes with Escape", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();

    await page.getByRole("button", { name: "Open menu" }).click();
    const menu = page.getByRole("dialog", { name: "Menu" });
    await expect(menu).toBeVisible();
    for (const label of ["Sell", "Shop", "Stores", "Help", "Account", "Basket"]) {
      await expect(menu.getByRole("link", { name: new RegExp(`^${label}`) })).toBeVisible();
    }

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("closes after choosing a link", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: /^Help/ }).click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
  });

  test("has no horizontal scroll", async ({ page }) => {
    for (const path of ["/", "/styleguide"]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
