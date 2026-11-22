import { describe, expect, it } from "vitest";

import {
  articleGuide,
  BUILTIN_GUIDES,
  fixedGuide,
  guideSummaries,
  isArticleSlug,
  modelValueGuide,
  TEAM_AUTHOR,
} from "./compose";
import {
  buildModelValueTable,
  type ModelPriceRow,
} from "@refnused/database/lib/guides/model-value";
import {
  isGuideSlug,
  modelValueSlug,
  parseModelValueSlug,
} from "@refnused/database/lib/guides/slugs";
import { sanityGuideSchema, type SanityGuide } from "@refnused/database/lib/guides/types";

const day = (d: string) => new Date(`2026-11-${d}T12:00:00.000Z`);

describe("guide slugs", () => {
  it("round-trips model price guide slugs", () => {
    expect(modelValueSlug("iphone-15")).toBe("how-much-is-my-iphone-15-worth");
    expect(parseModelValueSlug("how-much-is-my-iphone-15-worth")).toBe("iphone-15");
    expect(parseModelValueSlug("how-much-is-my-galaxy-s25-ultra-worth")).toBe("galaxy-s25-ultra");
  });

  it("rejects malformed slugs", () => {
    expect(parseModelValueSlug("how-much-is-my--worth")).toBeNull();
    expect(parseModelValueSlug("how-much-is-my-iPhone-worth")).toBeNull();
    expect(parseModelValueSlug("how-to-wipe-a-phone")).toBeNull();
    expect(isGuideSlug("../etc")).toBe(false);
    expect(isGuideSlug("Upper")).toBe(false);
    expect(isGuideSlug("x".repeat(121))).toBe(false);
  });

  it("reserves built-in URLs so a Sanity article can't take them", () => {
    expect(isArticleSlug("best-phones-2026")).toBe(true);
    expect(isArticleSlug("how-to-wipe-a-phone")).toBe(false);
    expect(isArticleSlug("phone-grading-explained")).toBe(false);
    expect(isArticleSlug("how-much-is-my-iphone-15-worth")).toBe(false);
  });
});

describe("buildModelValueTable", () => {
  const rows: ModelPriceRow[] = [
    { storageGb: 256, colour: "Black", grade: "A", pricePence: 30_000, updatedAt: day("02") },
    { storageGb: 256, colour: "Blue", grade: "A", pricePence: 31_000, updatedAt: day("05") },
    { storageGb: 128, colour: "Black", grade: "A", pricePence: 26_000, updatedAt: day("01") },
    { storageGb: 128, colour: "Black", grade: "C", pricePence: 16_500, updatedAt: day("01") },
    { storageGb: 128, colour: "Black", grade: "faulty", pricePence: 6_500, updatedAt: day("03") },
  ];

  it("takes the highest price across colours, smallest storage first", () => {
    const table = buildModelValueTable(rows);
    expect(table.rows).toEqual([
      { storageGb: 128, prices: { A: 26_000, C: 16_500, faulty: 6_500 } },
      { storageGb: 256, prices: { A: 31_000 } },
    ]);
    expect(table.grades).toEqual(["A", "C", "faulty"]);
  });

  it("finds the top price, the lowest working price and the latest change", () => {
    const table = buildModelValueTable(rows);
    expect(table.top).toEqual({ pricePence: 31_000, storageGb: 256, grade: "A" });
    expect(table.lowestWorkingPence).toBe(16_500);
    expect(table.updatedAt).toEqual(day("05"));
  });

  it("breaks top-price ties towards smaller storage and better grade", () => {
    const table = buildModelValueTable([
      { storageGb: 512, colour: "x", grade: "A", pricePence: 100, updatedAt: day("01") },
      { storageGb: 128, colour: "x", grade: "B", pricePence: 100, updatedAt: day("01") },
      { storageGb: 128, colour: "x", grade: "A", pricePence: 100, updatedAt: day("01") },
    ]);
    expect(table.top).toEqual({ pricePence: 100, storageGb: 128, grade: "A" });
  });

  it("has no top price when everything is zero or empty", () => {
    expect(buildModelValueTable([]).top).toBeNull();
    expect(buildModelValueTable([]).updatedAt).toBeNull();
    const zero = buildModelValueTable([
      { storageGb: 128, colour: "x", grade: "A", pricePence: 0, updatedAt: day("01") },
    ]);
    expect(zero.top).toBeNull();
    expect(zero.lowestWorkingPence).toBeNull();
  });

  it("rejects non-integer or negative pence", () => {
    expect(() => buildModelValueTable([{ ...rows[0]!, pricePence: 100.5 }])).toThrow(RangeError);
    expect(() => buildModelValueTable([{ ...rows[0]!, pricePence: -1 }])).toThrow(RangeError);
  });
});

const doc = (over: Partial<SanityGuide> = {}): SanityGuide =>
  sanityGuideSchema.parse({
    template: "article",
    title: "Best phones under £300",
    slug: "best-phones-under-300",
    createdAt: "2026-10-01T09:00:00Z",
    updatedAt: "2026-10-05T09:00:00Z",
    ...over,
  });

describe("fixedGuide", () => {
  it("uses the built-in copy and team author without Sanity", () => {
    const g = fixedGuide("wipe", null);
    expect(g.slug).toBe("how-to-wipe-a-phone");
    expect(g.title).toBe(BUILTIN_GUIDES.wipe.title);
    expect(g.author).toEqual(TEAM_AUTHOR);
    expect(g.body).toBeNull();
  });

  it("lets a Sanity document replace title, author and dates, but keeps the URL", () => {
    const g = fixedGuide(
      "grading",
      doc({
        template: "grading",
        slug: "something-else",
        title: "Grades, explained",
        author: { name: "Sam Lee", role: "Refurb lead" },
        publishedAt: "2026-12-01T00:00:00Z",
        updatedAt: "2026-12-02T00:00:00Z",
        body: [{ _type: "block", _key: "a" }],
      }),
    );
    expect(g.slug).toBe("phone-grading-explained");
    expect(g.title).toBe("Grades, explained");
    expect(g.author).toEqual({ kind: "person", name: "Sam Lee", role: "Refurb lead" });
    expect(g.publishedAt).toBe("2026-12-01T00:00:00.000Z");
    expect(g.updatedAt).toBe("2026-12-02T00:00:00.000Z");
    expect(g.body).toHaveLength(1);
  });

  it("never reports an update older than the built-in copy", () => {
    const g = fixedGuide("wipe", doc({ template: "wipe", updatedAt: "2020-01-01T00:00:00Z" }));
    expect(g.updatedAt).toBe(BUILTIN_GUIDES.wipe.updatedAt);
  });
});

describe("modelValueGuide", () => {
  const model = { slug: "iphone-15", name: "iPhone 15", brandName: "Apple", createdAt: day("01") };

  it("has a fixed title and URL and is updated whenever a price changes", () => {
    const g = modelValueGuide(model, { maxPricePence: 31_500, updatedAt: day("09") }, null);
    expect(g.slug).toBe("how-much-is-my-iphone-15-worth");
    expect(g.title).toBe("How much is my Apple iPhone 15 worth?");
    expect(g.description).toContain("We pay up to £315.");
    expect(g.publishedAt).toBe(day("01").toISOString());
    expect(g.updatedAt).toBe(day("09").toISOString());
    expect(g.relatedModels).toEqual(["iphone-15"]);
  });

  it("keeps the model title even if an editor sets another", () => {
    const g = modelValueGuide(
      model,
      { maxPricePence: null, updatedAt: null },
      doc({
        template: "model-value",
        model: "iphone-15",
        title: "Other",
        relatedModels: ["iphone-15", "iphone-16"],
      }),
    );
    expect(g.title).toBe("How much is my Apple iPhone 15 worth?");
    expect(g.relatedModels).toEqual(["iphone-15", "iphone-16"]);
    expect(g.description).not.toContain("up to");
  });
});

describe("articleGuide", () => {
  it("turns a Sanity article into a guide", () => {
    const g = articleGuide(doc({ relatedModels: ["pixel-9"] }));
    expect(g).toMatchObject({
      slug: "best-phones-under-300",
      template: "article",
      author: TEAM_AUTHOR,
      publishedAt: "2026-10-01T09:00:00.000Z",
      relatedModels: ["pixel-9"],
    });
  });

  it("drops articles without a slug or on a reserved URL", () => {
    expect(articleGuide(doc({ slug: null }))).toBeNull();
    expect(articleGuide(doc({ slug: "how-to-wipe-a-phone" }))).toBeNull();
    expect(articleGuide(doc({ slug: "how-much-is-my-iphone-15-worth" }))).toBeNull();
    expect(articleGuide(doc({ template: "wipe" }))).toBeNull();
  });
});

describe("guideSummaries", () => {
  it("lists fixed guides, then a price guide per model, then unique articles", () => {
    const list = guideSummaries({
      sanityGuides: [doc(), doc(), doc({ slug: "another-one", title: "Another" })],
      models: [
        {
          slug: "iphone-15",
          name: "iPhone 15",
          brandName: "Apple",
          createdAt: day("01"),
          maxPricePence: 31_500,
          pricesUpdatedAt: day("03"),
        },
      ],
    });
    expect(list.map((g) => g.slug)).toEqual([
      "how-to-wipe-a-phone",
      "phone-grading-explained",
      "how-much-is-my-iphone-15-worth",
      "best-phones-under-300",
      "another-one",
    ]);
  });
});

describe("sanityGuideSchema", () => {
  it("falls back to the article template for unknown values", () => {
    expect(doc({ template: "nonsense" as never }).template).toBe("article");
  });

  it("rejects bad model slugs and non-https images", () => {
    expect(() => doc({ model: "iPhone 15" })).toThrow();
    expect(() =>
      doc({ image: { url: "http://cdn.sanity.io/x.png", alt: null, width: 1, height: 1 } }),
    ).toThrow();
  });
});
