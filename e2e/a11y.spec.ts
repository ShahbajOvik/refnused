import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

for (const path of [
  "/",
  "/styleguide",
  "/guides",
  "/guides/how-much-is-my-iphone-15-worth",
  "/guides/how-to-wipe-a-phone",
  "/guides/phone-grading-explained",
  "/sell/apple/iphone-15",
]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`${path} has no WCAG 2.2 AA violations (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto(path);
      await expect(page.locator("html")).toHaveClass(colorScheme === "dark" ? /dark/ : /light/);

      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      const summary = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 5),
      }));
      expect(summary).toEqual([]);
    });
  }
}
