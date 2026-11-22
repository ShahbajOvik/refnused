import { expect, test } from "@playwright/test";

import { ADMIN_URL } from "../playwright.config";

/*
 * SEO plumbing: sitemaps, robots, canonical + hreflang, noindex, Open Graph
 * images, JSON-LD and guides. Desktop only: none of this depends on the viewport.
 */
test.skip(({ isMobile }) => isMobile, "Not viewport-dependent");

async function jsonLd(page: import("@playwright/test").Page) {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((b) => {
    const data = JSON.parse(b) as object | object[];
    return Array.isArray(data) ? data : [data];
  }) as Record<string, unknown>[];
}

test.describe("sitemaps and robots", () => {
  test("/sitemap.xml is an index of the split sitemaps", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.headers()["content-type"]).toContain("xml");
    const xml = await res.text();
    expect(xml).toContain("<sitemapindex");
    for (const name of ["pages", "models", "products", "stores", "guides"]) {
      expect(xml).toContain(`/sitemaps/${name}/sitemap.xml</loc>`);
      const child = await request.get(`/sitemaps/${name}/sitemap.xml`);
      expect(child.status(), name).toBe(200);
      expect(await child.text()).toContain("<urlset");
    }
  });

  test("each sitemap has its own pages, with hreflang", async ({ request }) => {
    const models = await (await request.get("/sitemaps/models/sitemap.xml")).text();
    expect(models).toContain("/sell/apple/iphone-15</loc>");
    expect(models).toContain('hreflang="en-GB"');
    expect(models).toContain("<lastmod>");

    const products = await (await request.get("/sitemaps/products/sitemap.xml")).text();
    expect(products).toContain("/shop/apple/iphone-15-128gb-black-k3x9q2</loc>");
    // Sold units keep their page but aren't in the sitemap.
    expect(products).not.toContain("y8c5gn</loc>");

    const guides = await (await request.get("/sitemaps/guides/sitemap.xml")).text();
    expect(guides).toContain("/guides/how-much-is-my-iphone-15-worth</loc>");
    expect(guides).toContain("/guides/how-to-wipe-a-phone</loc>");
    expect(guides).toContain("/guides/phone-grading-explained</loc>");

    const pages = await (await request.get("/sitemaps/pages/sitemap.xml")).text();
    expect(pages).toContain("/guides</loc>");
    expect(pages).not.toContain("/basket");
  });

  test("robots.txt blocks only admin and API, and points at the index", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toContain("Disallow: /api/");
    // Blocking these would hide their noindex from crawlers.
    expect(robots).not.toContain("Disallow: /account");
    expect(robots).not.toContain("Disallow: /basket");
    expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  });
});

test.describe("noindex", () => {
  for (const path of ["/basket", "/checkout", "/account", `${ADMIN_URL}/admin`]) {
    test(`${path} sends X-Robots-Tag: noindex`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.headers()["x-robots-tag"]).toContain("noindex");
    });
  }

  test("public pages don't send X-Robots-Tag", async ({ request }) => {
    const res = await request.get("/sell");
    expect(res.headers()["x-robots-tag"]).toBeUndefined();
  });
});

test.describe("metadata", () => {
  test("sell model pages: canonical, hreflang, own OG image, FAQPage", async ({
    page,
    request,
  }) => {
    await page.goto("/sell/apple/iphone-15");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/sell\/apple\/iphone-15$/,
    );
    await expect(page.locator('link[rel="alternate"][hreflang="en-GB"]')).toHaveAttribute(
      "href",
      /\/sell\/apple\/iphone-15$/,
    );
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveCount(1);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );

    const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(ogImage).toMatch(/\/sell\/apple\/iphone-15\/opengraph-image/);
    const image = await request.get(new URL(ogImage!).pathname + new URL(ogImage!).search);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");

    const data = await jsonLd(page);
    const faq = data.find((d) => d["@type"] === "FAQPage") as {
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };
    expect(faq.mainEntity[0]!.name).toBe("How much is my Apple iPhone 15 worth?");
    // The structured data matches the visible questions.
    for (const q of faq.mainEntity) {
      await expect(page.getByRole("heading", { name: q.name, exact: true })).toBeAttached();
    }
    expect(data.some((d) => d["@type"] === "BreadcrumbList")).toBe(true);
  });

  test("home has Organization and WebSite JSON-LD and the site-wide OG image", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    const data = await jsonLd(page);
    const org = data.find((d) => d["@type"] === "Organization");
    const site = data.find((d) => d["@type"] === "WebSite");
    expect(org?.["@id"]).toMatch(/\/#organization$/);
    expect(site?.publisher).toEqual({ "@id": org?.["@id"] });
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(new URL(ogImage!).pathname).toBe("/opengraph-image");
    expect((await request.get("/opengraph-image")).headers()["content-type"]).toBe("image/png");
  });

  test("product and store pages have their own OG images", async ({ page }) => {
    for (const path of [
      "/shop/apple/iphone-15-128gb-black-k3x9q2",
      "/stores/metrotech-north-shields",
    ]) {
      await page.goto(path);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
        "content",
        new RegExp(`${path}/opengraph-image`),
      );
    }
  });
});

test.describe("guides", () => {
  test("model price guide shows live prices, Article JSON-LD and cross-links", async ({ page }) => {
    await page.goto("/guides/how-much-is-my-iphone-15-worth");
    await expect(
      page.getByRole("heading", { level: 1, name: "How much is my Apple iPhone 15 worth?" }),
    ).toBeVisible();
    // Seed: £260 base, +10% per storage step → 512GB grade A = £312 → rounded down to £310.
    await expect(page.getByText(/Today we pay up to/)).toContainText("£310");
    const table = page.getByRole("table");
    await expect(table.getByRole("rowheader", { name: "128GB" })).toBeVisible();
    await expect(table.getByRole("rowheader", { name: "512GB" })).toBeVisible();

    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Guides");
    const article = (await jsonLd(page)).find((d) => d["@type"] === "Article")!;
    expect(article.datePublished).toBeTruthy();
    expect(article.dateModified).toBeTruthy();
    expect(article.author).toMatchObject({ "@type": "Organization" });

    const links = page.getByRole("region", { name: /More about the Apple iPhone 15/ });
    await expect(links.getByRole("link", { name: /Sell your Apple iPhone 15/ })).toHaveAttribute(
      "href",
      "/sell/apple/iphone-15",
    );
    await expect(
      links.getByRole("link", { name: /Buy a refurbished Apple iPhone 15/ }),
    ).toHaveAttribute("href", "/shop/apple?model=iphone-15");
    await page.getByRole("link", { name: /Get your exact price/ }).click();
    await expect(page).toHaveURL(/\/sell\/apple\/iphone-15$/);
  });

  test("sell and product pages link back to the price guide", async ({ page }) => {
    await page.goto("/sell/apple/iphone-15");
    await expect(
      page.getByRole("link", { name: /How much is my Apple iPhone 15 worth\?/ }),
    ).toHaveAttribute("href", "/guides/how-much-is-my-iphone-15-worth");
    await page.goto("/shop/apple/iphone-15-128gb-black-k3x9q2");
    await expect(
      page.getByRole("link", { name: /How much is my Apple iPhone 15 worth\?/ }),
    ).toHaveAttribute("href", "/guides/how-much-is-my-iphone-15-worth");
    await expect(
      page.getByRole("link", { name: "Grading explained", exact: true }),
    ).toHaveAttribute("href", "/guides/phone-grading-explained");
  });

  test("wipe and grading guides render without Sanity", async ({ page }) => {
    await page.goto("/guides/how-to-wipe-a-phone");
    await expect(page.getByRole("heading", { level: 2, name: "iPhone" })).toBeVisible();
    await page.goto("/guides/phone-grading-explained");
    await expect(page.getByRole("heading", { level: 2, name: "Battery health" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Shop Grade A phones" })).toHaveAttribute(
      "href",
      "/shop?grade=A",
    );
  });

  test("the guides index lists every kind of guide", async ({ page }) => {
    await page.goto("/guides");
    await expect(page.getByRole("link", { name: /How to wipe a phone/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Apple iPhone 15\b/ })).toBeVisible();
  });

  test("unknown guides are not found", async ({ page }) => {
    // Streamed pages can't change the status code; Next marks them noindex.
    for (const path of ["/guides/does-not-exist", "/guides/how-much-is-my-nokia-3310-worth"]) {
      await page.goto(path);
      await expect(page.getByText("This page could not be found.")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
        "content",
        /noindex/,
      );
    }
  });
});
