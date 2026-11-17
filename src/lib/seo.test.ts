import { describe, expect, it } from "vitest";

import { stores } from "@/config/site";
import { absoluteUrl, breadcrumbJsonLd, storesJsonLd } from "@/lib/seo";

describe("absoluteUrl", () => {
  it("resolves paths against the site URL", () => {
    expect(absoluteUrl("/shop")).toBe("http://localhost:3000/shop");
  });
});

describe("breadcrumbJsonLd", () => {
  it("numbers items from 1 with absolute URLs", () => {
    const data = breadcrumbJsonLd([
      { label: "Home", href: "/" },
      { label: "Shop", href: "/shop" },
    ]);
    expect(data["@type"]).toBe("BreadcrumbList");
    expect(data.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "http://localhost:3000/" },
      { "@type": "ListItem", position: 2, name: "Shop", item: "http://localhost:3000/shop" },
    ]);
  });
});

describe("storesJsonLd", () => {
  it("describes every store with a GB postal address", () => {
    const data = storesJsonLd();
    expect(data).toHaveLength(stores.length);
    for (const entry of data) {
      expect(entry["@type"]).toBe("MobilePhoneStore");
      expect(entry.address.addressCountry).toBe("GB");
    }
  });
});
