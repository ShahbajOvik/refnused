import { expect, test } from "@playwright/test";

test.describe("/styleguide", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/styleguide");
  });

  test("is excluded from search engines", async ({ page }) => {
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex.*nofollow/,
    );
  });

  test("shows every component section", async ({ page }) => {
    for (const heading of [
      "Colour",
      "Typography",
      "Spacing",
      "Radius",
      "Button",
      "Badge",
      "Card",
      "Input and Select",
      "Dialog",
      "Toast",
      "Skeleton",
      "Breadcrumbs",
    ]) {
      await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
    }
    await expect(page.getByText("Grade A · Excellent").first()).toBeVisible();
  });

  test("dialog opens, traps focus and closes with Escape", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Open dialog" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Remove from basket?" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("select chooses an option", async ({ page }) => {
    await page.getByRole("combobox", { name: "Storage" }).click();
    await page.getByRole("option", { name: "256GB" }).click();
    await expect(page.getByRole("combobox", { name: "Storage" })).toHaveText(/256GB/);
  });

  test("toast appears", async ({ page }) => {
    await page.getByRole("button", { name: "Success toast" }).click();
    await expect(page.getByText("Quote saved")).toBeVisible();
  });
});
