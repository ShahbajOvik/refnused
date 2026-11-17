import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";

// Listing pages render on demand from the e2e server's in-process database,
// which is slow while many test browsers share it.
const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 60_000 });

/*
 * Sample stock from the seed (src/db/seed/catalogue.ts): 26 phones for
 * sale, one sold (iPhone 15 Yellow) and one reserved (Pixel 9 Peony).
 */
const LISTED = 26;
const IPHONE_15_BLACK = "/shop/apple/iphone-15-128gb-black-k3x9q2";
const IPHONE_16_ULTRAMARINE = "/shop/apple/iphone-16-128gb-ultramarine-t9b6xe";
const SOLD = "/shop/apple/iphone-15-128gb-yellow-y8c5gn";

// Each test acts as a different visitor, so per-IP rate limits don't collide.
test.beforeEach(async ({ page }) => {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${octet()}, 10.0.1.${octet()}` });
});

async function jsonLd(page: Page) {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.map((text) => JSON.parse(text) as Record<string, unknown>);
}

const results = (page: Page) =>
  page.getByRole("heading", { level: 2, name: "Phones" }).locator("xpath=following-sibling::ul[1]");
/** The filter form is hydrated (filters apply on change). */
const formReady = (page: Page) =>
  expect(page.locator("form#shop-filters[data-ready]")).toBeAttached({ timeout: 30_000 });
const count = (page: Page) => page.getByRole("status").filter({ hasText: /\d+ phones?/ });

test.describe("shop listing", () => {
  test("lists phones with breadcrumbs, structured data and pages", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.getByRole("heading", { level: 1, name: "Refurbished phones" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Shop");
    await expect(count(page)).toHaveText(`${LISTED} phones`, { timeout: 15_000 });
    await expect(results(page).getByRole("listitem")).toHaveCount(24);
    expect((await jsonLd(page)).some((d) => d["@type"] === "ItemList")).toBe(true);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);

    await page
      .getByRole("navigation", { name: "Pages" })
      .getByRole("link", { name: "Next" })
      .click();
    await expect(page).toHaveURL(/\/shop\?page=2$/);
    await expect(results(page).getByRole("listitem")).toHaveCount(LISTED - 24);
    await expect(page.getByRole("link", { name: "Page 2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("filters apply on change, update the URL and can be removed", async ({ page, isMobile }) => {
    test.skip(isMobile, "Auto-apply is for wide screens");
    await page.goto("/shop");
    await formReady(page);
    const filters = page.getByRole("region", { name: "Filters" });

    await filters.getByRole("checkbox", { name: /^Samsung/ }).check();
    await expect(page).toHaveURL(/\/shop\?brand=samsung$/);
    await expect(count(page)).toHaveText("7 phones");
    await expect(results(page)).not.toContainText("iPhone");

    await filters.getByRole("checkbox", { name: /^Grade A/ }).check();
    await expect(page).toHaveURL(/\/shop\?brand=samsung&grade=A$/);
    await expect(count(page)).toHaveText("3 phones");

    // Remove a filter from its chip; the checkbox follows.
    await page.getByRole("link", { name: /Samsung \(remove filter\)/ }).click();
    await expect(page).toHaveURL(/\/shop\?grade=A$/);
    await expect(filters.getByRole("checkbox", { name: /^Samsung/ })).not.toBeChecked();
    await expect(filters.getByRole("checkbox", { name: /^Grade A/ })).toBeChecked();
  });

  test("sorting is part of the shareable URL", async ({ page }) => {
    await page.goto("/shop");
    await formReady(page);
    await page.getByLabel("Sort by").selectOption("price-asc");
    await expect(page).toHaveURL(/\/shop\?sort=price-asc$/);
    const prices = () =>
      results(page)
        .locator("article p.text-lg")
        .allTextContents()
        .then((all) => all.map((p) => Number(p.replace(/[£,]/g, ""))));
    await expect
      .poll(async () => {
        const list = await prices();
        return list.join() === [...list].sort((a, b) => a - b).join();
      })
      .toBe(true);
  });

  test("a shared filtered link renders on the server and isn't indexed", async ({ page }) => {
    await page.goto("/shop?storage=128&grade=B,A&max=500&battery=90&store=fairtech-south-shields");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/shop\?grade=A,B&storage=128&store=fairtech-south-shields&max=500&battery=90$/,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    // Only the iPhone 15 Blue at FairTech (£429, battery 91%).
    await expect(count(page)).toHaveText("1 phone", { timeout: 15_000 });
    for (const chip of ["Grade A", "Grade B", "128GB", "Price £0 to £500", "Battery 90%+"]) {
      await expect(page.getByRole("link", { name: `${chip} (remove filter)` })).toBeVisible();
    }
  });

  test("brand pages filter by brand and keep it out of the query", async ({ page }) => {
    await page.goto("/shop/google?sort=price-desc");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Refurbished Google phones", {
      timeout: 15_000,
    });
    await expect(count(page)).toHaveText("6 phones");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/shop\/google\?sort=price-desc$/,
    );
  });

  test("shows a helpful message when nothing matches", async ({ page }) => {
    await page.goto("/shop?brand=apple&grade=C&min=900");
    await expect(page.getByText("No phones match those filters.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Clear the filters" })).toHaveAttribute(
      "href",
      "/shop",
    );
  });

  test("small screens open filters in a panel", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile layout only");
    await page.goto("/shop");
    await formReady(page);
    const panel = page.getByRole("region", { name: "Filters" });
    await expect(panel).toBeHidden();
    await page.getByRole("link", { name: /^Filters/ }).click();
    await expect(panel).toBeVisible();
    await panel.getByRole("checkbox", { name: /^Google/ }).check();
    await panel.getByRole("checkbox", { name: /^Grade B/ }).check();
    // Nothing applies until asked, on small screens.
    await expect(page).toHaveURL(/\/shop$/);
    await panel.getByRole("button", { name: "Show phones" }).click();
    await expect(page).toHaveURL(/\/shop\?brand=google&grade=B$/);
    await expect(panel).toBeHidden();
    await expect(page.getByRole("link", { name: "Filters (2)" })).toBeVisible();
  });
});

test.describe("product page", () => {
  test("shows the unit, its condition, delivery and stock", async ({ page }) => {
    await page.goto(IPHONE_15_BLACK);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Apple iPhone 15, 128GB, Black",
      { timeout: 15_000 },
    );
    await expect(page).toHaveTitle(/Apple iPhone 15, 128GB, Black, Grade A refurbished/);
    await expect(page.getByTestId("product-price")).toHaveText("£469.00");
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Apple");
    await expect(page.getByRole("heading", { name: /Condition: Grade A/ })).toBeVisible();
    await expect(page.getByRole("meter", { name: "Battery health" })).toHaveAttribute(
      "aria-valuetext",
      "96%, Like new",
    );
    await expect(page.getByRole("heading", { name: "12-month warranty" })).toBeVisible();
    await expect(page.getByText("Free tracked delivery · Free")).toBeVisible();
    await expect(
      page.getByText("MetroTech, 77A Rudyerd Street, North Shields NE29 6RR"),
    ).toBeVisible();

    const stock = page.getByRole("table", { name: /iPhone 15 phones in stock/ });
    await expect(stock.getByRole("row", { name: /MetroTech/ })).toContainText("This phone is here");
    await expect(page.getByRole("heading", { name: "You might also like" })).toBeVisible();
  });

  test("has Product and Offer structured data", async ({ page }) => {
    await page.goto(IPHONE_15_BLACK);
    const product = (await jsonLd(page)).find((d) => d["@type"] === "Product") as {
      itemCondition: string;
      offers: Record<string, unknown> & {
        hasMerchantReturnPolicy: Record<string, unknown>;
        shippingDetails: unknown[];
      };
    };
    expect(product.itemCondition).toBe("https://schema.org/RefurbishedCondition");
    expect(product.offers).toMatchObject({
      price: "469.00",
      priceCurrency: "GBP",
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/RefurbishedCondition",
    });
    expect(product.offers.hasMerchantReturnPolicy["@type"]).toBe("MerchantReturnPolicy");
    expect(product.offers.shippingDetails.length).toBeGreaterThan(0);
  });

  test("the gallery shows each photo of the unit", async ({ page }) => {
    await page.goto(IPHONE_15_BLACK);
    await page.getByRole("button", { name: /Show photo 2: Back of this iPhone 15/ }).click();
    await expect(page.getByText("Photo 2 of 4")).toBeVisible();
    await page.getByRole("button", { name: "Next photo" }).click();
    await expect(page.getByText("Photo 3 of 4")).toBeVisible();
  });

  test("View in 3D loads the viewer only when asked", async ({ page, isMobile }) => {
    test.skip(isMobile, "One run is enough");
    // three.js is a big download for the e2e server under parallel load.
    test.setTimeout(90_000);
    await page.goto(IPHONE_15_BLACK);
    await expect(page.locator("canvas")).toHaveCount(0);
    const dialog = page.getByRole("dialog", { name: "Apple iPhone 15 in 3D" });
    // Retry until hydrated: a click before then does nothing.
    await expect(async () => {
      await page.getByRole("button", { name: "View in 3D" }).click();
      await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    // A canvas where WebGL works, or the fallback message where it doesn't.
    await expect(
      dialog.locator("canvas").or(dialog.getByText("Your browser can’t show 3D models.")),
    ).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("trade in and save works out the price on the server", async ({ page }) => {
    await page.goto(IPHONE_16_ULTRAMARINE);
    const section = page.locator("section", {
      has: page.getByRole("heading", { name: "Trade in and save" }),
    });
    const result = section.getByTestId("trade-in-result");
    // Retry until hydrated: before then the form doesn't work out anything.
    await expect(async () => {
      await section.getByLabel("Your current phone").selectOption("iphone-13");
      await section.getByLabel("Storage").selectOption("256");
      await section.getByRole("radio", { name: /^Good/ }).check();
      await section.getByRole("button", { name: "Work out my saving" }).click();
      await expect(result).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    // Sample price: iPhone 13 256GB at grade B is £140, so £599 − £140.
    await expect(result).toContainText("for up to £140.00");
    await expect(result).toContainText("Pay £459.00");
    await expect(result.getByRole("link", { name: "Get a full quote" })).toHaveAttribute(
      "href",
      "/sell/apple/iphone-13",
    );
  });

  test("unknown phones show not found", async ({ page }) => {
    await page.goto("/shop/apple/iphone-15-128gb-black-zzzzzz");
    await expect(page.getByText("This page could not be found.")).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("sold phones", () => {
  test("keep their page with similar phones and structured data", async ({ page }) => {
    await page.goto(SOLD);
    await expect(page.getByText("Sorry, this phone has sold")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("product-price")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Similar phones in stock" })).toBeVisible();
    const product = (await jsonLd(page)).find((d) => d["@type"] === "Product") as {
      offers: { availability: string };
    };
    expect(product.offers.availability).toBe("https://schema.org/SoldOut");
  });

  test("notify me needs consent, then confirms", async ({ page }) => {
    await page.goto(SOLD);
    const form = page.locator("section", {
      has: page.getByRole("heading", { name: "Get an email when one is in stock" }),
    });
    await form.getByLabel("Email", { exact: true }).fill(`e2e.${Date.now()}@example.co.uk`);
    await form.getByRole("button", { name: "Notify me" }).click();
    await expect(form.getByRole("alert")).toHaveText("Please check the highlighted details.");
    await expect(form.getByText("Tick the box so we can email you")).toBeVisible();

    await form.getByRole("radio", { name: "Any iPhone 15" }).check();
    await form.getByRole("checkbox", { name: /Email me when one is in stock/ }).check();
    await form.getByRole("button", { name: "Notify me" }).click();
    await expect(form.getByRole("status")).toHaveText(
      "Done. We’ll email you when we have the iPhone 15 in stock.",
    );
  });
});

test.describe("compare", () => {
  test("pick phones in the shop and compare them side by side", async ({ page }) => {
    await page.goto("/shop?brand=google&sort=price-asc");
    await formReady(page);
    const compareButtons = results(page).getByRole("button", { name: /^Compare / });
    await compareButtons.nth(0).click();
    await compareButtons.nth(1).click();
    await expect(compareButtons.nth(0)).toHaveAttribute("aria-pressed", "true");

    const tray = page.getByRole("complementary", { name: "Compare phones" });
    await expect(tray).toContainText("2 of 3 phones picked");
    await tray.getByRole("link", { name: "Compare now" }).click();

    await expect(page).toHaveURL(/\/compare\?items=[a-z0-9-]+,[a-z0-9-]+$/);
    const table = page.getByRole("table");
    await expect(table.getByRole("columnheader")).toHaveCount(2);
    await expect(table.getByRole("row", { name: /^Price/ })).toContainText("Lowest");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    await table
      .getByRole("link", { name: /^Remove/ })
      .first()
      .click();
    await expect(table.getByRole("columnheader")).toHaveCount(1);
  });

  test("a shared link works on its own and ignores extra or bad items", async ({ page }) => {
    await page.goto(
      "/compare?items=iphone-15-128gb-black-k3x9q2,nope,pixel-9-128gb-obsidian-p2h8vd,iphone-16-128gb-ultramarine-t9b6xe,galaxy-s24-128gb-onyx-black-m4r9wb",
    );
    const headers = page.getByRole("table").getByRole("columnheader");
    await expect(headers).toHaveCount(2, { timeout: 15_000 });
    await expect(headers.first()).toContainText("iPhone 15");
  });
});

test.describe("accessibility", () => {
  for (const path of [
    "/shop",
    IPHONE_15_BLACK,
    SOLD,
    "/compare?items=iphone-15-128gb-black-k3x9q2,pixel-9-128gb-obsidian-p2h8vd",
  ]) {
    test(`${path} has no WCAG 2.2 AA violations`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator("[data-slot='skeleton']")).toHaveCount(0, { timeout: 30_000 });
      const scan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(scan.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
    });
  }
});
