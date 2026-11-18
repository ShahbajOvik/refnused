import { describe, expect, it } from "vitest";

import { stores } from "@/config/site";
import { absoluteUrl, breadcrumbJsonLd, storeJsonLd, storesJsonLd } from "@/lib/seo";
import { storeName } from "@/lib/stores";

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

const HOURS = {
  mon: { opens: "09:00", closes: "17:30" },
  tue: { opens: "09:00", closes: "17:30" },
  wed: { opens: "09:00", closes: "17:30" },
  thu: { opens: "09:00", closes: "17:30" },
  fri: { opens: "09:00", closes: "17:30" },
  sat: { opens: "10:00", closes: "16:00" },
  sun: null,
};

const fullStore = (s: (typeof stores)[number]) => ({
  ...s,
  email: null,
  openingHours: HOURS,
  latitude: 55.0,
  longitude: -1.45,
  parkingInfo: null,
  nearestMetro: null,
  photos: [{ key: "stores/2026-11/front.webp", alt: "Shop front" }],
});

describe("storesJsonLd", () => {
  it("describes every store as an ElectronicsStore with address, geo and hours", () => {
    const data = storesJsonLd(stores.map(fullStore));
    expect(data).toHaveLength(stores.length);
    for (const entry of data) {
      expect(entry["@type"]).toBe("ElectronicsStore");
      expect(entry.address.addressCountry).toBe("GB");
      expect(entry.openingHoursSpecification).toHaveLength(6);
      expect(entry.geo).toMatchObject({ "@type": "GeoCoordinates", latitude: 55.0 });
      expect(entry.image).toEqual(["http://localhost:3000/media/stores/2026-11/front.webp"]);
      expect(entry).not.toHaveProperty("aggregateRating");
    }
  });

  it("uses exactly the same name, address and phone as the page", () => {
    const store = fullStore(stores.find((s) => s.slug === "fairtech-north-shields")!);
    const entry = storeJsonLd(store);
    expect(entry.name).toBe(storeName(store));
    expect(entry.name).toBe("FairTech, North Shields");
    expect(entry.address).toMatchObject({
      streetAddress: "20B Saville Street (West)",
      addressLocality: "North Shields",
      postalCode: "NE29 6QR",
    });
    expect(entry.telephone).toBe("+441914358411");
    expect(entry.url).toBe("http://localhost:3000/stores/fairtech-north-shields");
  });

  it("leaves out geo and hours when they aren't set", () => {
    const entry = storeJsonLd({
      ...fullStore(stores[0]!),
      openingHours: null,
      latitude: null,
      longitude: null,
      photos: [],
    });
    expect(entry).not.toHaveProperty("geo");
    expect(entry).not.toHaveProperty("openingHoursSpecification");
    expect(entry).not.toHaveProperty("image");
  });
});
