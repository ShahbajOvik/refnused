import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/*
 * Store pages, from the stores table. The test snapshot gives MetroTech
 * demo opening hours, parking text and one demo review
 * (src/db/seed/demo.ts); the other stores have no hours set.
 */

const STORES = [
  {
    slug: "metrotech-north-shields",
    name: "MetroTech, North Shields",
    street: "77A Rudyerd Street",
    townLine: "North Shields NE29 6RR",
    phone: "+441913800456",
    phoneDisplay: "0191 380 0456",
  },
  {
    slug: "fairtech-south-shields",
    name: "FairTech, South Shields",
    street: "2 King St",
    townLine: "South Shields NE33 1HT",
    phone: "+441914472311",
    phoneDisplay: "0191 447 2311",
  },
  {
    slug: "fairtech-north-shields",
    name: "FairTech, North Shields",
    street: "20B Saville Street (West)",
    townLine: "North Shields NE29 6QR",
    phone: "+441914358411",
    phoneDisplay: "0191 435 8411",
  },
];

async function jsonLd(page: Page) {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((text) => {
    const data = JSON.parse(text) as unknown;
    return (Array.isArray(data) ? data : [data]) as Record<string, unknown>[];
  });
}

test.describe("stores", () => {
  test("/stores lists every store with links, breadcrumbs and structured data", async ({
    page,
  }) => {
    await page.goto("/stores");
    await expect(page.getByRole("heading", { level: 1, name: "Our stores" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Stores");
    await expect(page).toHaveTitle(/Our stores/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/stores$/);
    const main = page.getByRole("main");
    for (const store of STORES) {
      await expect(main.getByRole("link", { name: store.name, exact: true })).toHaveAttribute(
        "href",
        `/stores/${store.slug}`,
      );
    }
    const data = await jsonLd(page);
    expect(data.find((d) => d["@type"] === "ItemList")).toBeTruthy();
    expect(data.filter((d) => d["@type"] === "ElectronicsStore")).toHaveLength(3);
  });

  test("a store page has everything a visitor needs", async ({ page }) => {
    await page.goto("/stores/metrotech-north-shields");
    await expect(
      page.getByRole("heading", { level: 1, name: "MetroTech, North Shields" }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText(
      "MetroTech, North Shields",
    );

    // Open-now status is worked out in the browser.
    await expect(page.getByText(/^(Open now|Closing soon|Closed) · /).first()).toBeVisible();

    // Contact: tap to call and directions.
    const details = page.getByRole("complementary", { name: "Store details" });
    await expect(details.locator("address")).toContainText("77A Rudyerd Street");
    await expect(details.getByRole("link", { name: /Call 0191 380 0456/ })).toHaveAttribute(
      "href",
      "tel:+441913800456",
    );
    await expect(
      details.getByRole("link", { name: /Directions to MetroTech, North Shields/ }),
    ).toHaveAttribute("href", /google\.com\/maps\/dir\/.*destination=MetroTech/);

    // Hours for every day, parking and Metro.
    const hours = page.getByRole("table", { name: "Opening hours, UK time" });
    await expect(hours.getByRole("row")).toHaveCount(7);
    await expect(hours.getByRole("row", { name: /Monday/ })).toContainText("9am–5:30pm");
    await expect(hours.getByRole("row", { name: /Sunday/ })).toContainText("Closed");
    await expect(page.getByText("Demo parking text")).toBeVisible();
    await expect(page.getByText("North Shields Metro station is a short walk away.")).toBeVisible();

    // The map only loads when asked.
    await expect(page.locator("iframe")).toHaveCount(0);
    await page.getByRole("button", { name: /^Show map of MetroTech/ }).click();
    await expect(page.locator("iframe[title^='Map showing MetroTech']")).toBeAttached();

    // Reviews of this store.
    const reviews = page.getByRole("region", { name: "Reviews of MetroTech, North Shields" });
    await expect(reviews).toContainText("5.0 out of 5 from 1 review");
    await expect(reviews).toContainText("Demo reviewer");
  });

  test("shows the stock on the shelf at that store, linking to the filtered shop", async ({
    page,
  }) => {
    await page.goto("/stores/fairtech-south-shields");
    const stock = page.getByRole("region", { name: "In stock at FairTech, South Shields" });
    const seeAll = stock.getByRole("link", { name: /See all \d+ at this store/ });
    await expect(seeAll).toBeVisible();
    const total = Number((await seeAll.textContent())!.match(/\d+/)![0]);
    expect(total).toBeGreaterThan(0);
    await expect(stock.getByRole("listitem")).toHaveCount(Math.min(total, 8));
    await expect(seeAll).toHaveAttribute("href", "/shop?store=fairtech-south-shields");
    await seeAll.click();
    await expect(page.getByRole("status").filter({ hasText: /\d+ phones?/ })).toHaveText(
      `${total} ${total === 1 ? "phone" : "phones"}`,
      { timeout: 15_000 },
    );
  });

  test("a store without hours set says to call", async ({ page }) => {
    await page.goto("/stores/fairtech-north-shields");
    await expect(page.getByText("Call the store for opening hours.")).toBeVisible();
    await expect(page.getByText(/^(Open now|Closed) · /)).toHaveCount(0);
    await expect(page.getByRole("region", { name: /Reviews of/ })).toContainText(
      "No reviews of this store yet",
    );
  });

  test("an unknown store is not found", async ({ page }) => {
    // Streamed pages can't change the status code; Next marks them noindex.
    await page.goto("/stores/not-a-store");
    await expect(page.getByText("This page could not be found.")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  });

  test("structured data: ElectronicsStore with geo and opening hours", async ({ page }) => {
    await page.goto("/stores/metrotech-north-shields");
    const store = (await jsonLd(page)).find((d) => d["@type"] === "ElectronicsStore")!;
    expect(store).toMatchObject({
      name: "MetroTech, North Shields",
      telephone: "+441913800456",
      url: expect.stringMatching(/\/stores\/metrotech-north-shields$/),
      address: {
        "@type": "PostalAddress",
        streetAddress: "77A Rudyerd Street",
        addressLocality: "North Shields",
        postalCode: "NE29 6RR",
        addressCountry: "GB",
      },
      geo: { "@type": "GeoCoordinates" },
    });
    expect(store.openingHoursSpecification).toHaveLength(6);
    const breadcrumbs = (await jsonLd(page)).find((d) => d["@type"] === "BreadcrumbList");
    expect(breadcrumbs).toBeTruthy();
  });

  test("name, address and phone are identical on the page, in the footer and in the schema", async ({
    page,
  }) => {
    for (const store of STORES) {
      await page.goto(`/stores/${store.slug}`);
      const expected = `${store.street}${store.townLine}`;

      const pageAddress = page
        .getByRole("complementary", { name: "Store details" })
        .locator("address");
      await expect(pageAddress).toHaveText(expected);

      const footerItem = page
        .getByRole("contentinfo")
        .getByRole("listitem")
        .filter({ has: page.getByRole("link", { name: store.name, exact: true }) });
      await expect(footerItem.locator("address")).toHaveText(expected);
      await expect(footerItem.getByRole("link", { name: /^0191/ })).toHaveAttribute(
        "href",
        `tel:${store.phone}`,
      );
      await expect(footerItem).toContainText(store.phoneDisplay);
      await expect(page.getByRole("complementary", { name: "Store details" })).toContainText(
        store.phoneDisplay,
      );

      const schema = (await jsonLd(page)).find((d) => d["@type"] === "ElectronicsStore")!;
      const address = schema.address as Record<string, string>;
      expect(schema.name).toBe(store.name);
      expect(schema.telephone).toBe(store.phone);
      expect(`${address.streetAddress}${address.addressLocality} ${address.postalCode}`).toBe(
        expected,
      );
    }
  });

  test("the stores sitemap lists every store page", async ({ request }) => {
    const xml = await (await request.get("/sitemaps/stores/sitemap.xml")).text();
    for (const store of STORES) expect(xml).toContain(`/stores/${store.slug}</loc>`);
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  });

  for (const path of ["/stores", "/stores/metrotech-north-shields"]) {
    test(`${path} has no WCAG 2.2 AA violations`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const scan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(scan.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
    });
  }
});
