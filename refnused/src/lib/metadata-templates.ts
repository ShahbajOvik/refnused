import type { Metadata } from "next";

import { siteConfig } from "@refnused/database/config/site";
import { formatPrice } from "@refnused/database/lib/format";
import { GRADE_INFO, type Grade } from "@refnused/database/lib/grades";
import { guidePath } from "@refnused/database/lib/guides/slugs";
import type { Guide } from "@refnused/database/lib/guides/types";
import { metaDescription, pageMetadata } from "@/lib/metadata";
import { productPath, productTitle } from "@refnused/database/lib/shop/paths";
import type { VariantOptions } from "@refnused/database/lib/shop/variant-label";
import { variantLabel } from "@refnused/database/lib/shop/variant-label";
import {
  storeAddress,
  storeName,
  storePath,
  type PublicStore,
} from "@refnused/database/lib/stores";

/*
 * generateMetadata templates, one per page type. Pure: pages load the data
 * and pass it in. Each returns pageMetadata(), so canonical, hreflang,
 * Open Graph and Twitter tags are always complete.
 */

export function homeMetadata(): Metadata {
  return pageMetadata({
    title: `${siteConfig.name}: sell your phone or buy refurbished`,
    absoluteTitle: true,
    description:
      "Get an instant quote for your used phone, or buy a graded refurbished phone with a warranty. Online, or in store in North Shields and South Shields.",
    path: "/",
  });
}

export function sellBrandMetadata(brand: { slug: string; name: string }): Metadata {
  return pageMetadata({
    title: `Sell your ${brand.name} phone`,
    description: `Instant trade-in quotes for ${brand.name} phones. Free postage or drop off in store in North Shields or South Shields.`,
    path: `/sell/${brand.slug}`,
  });
}

export function sellModelMetadata(
  m: {
    slug: string;
    name: string;
    brandSlug: string;
    brandName: string;
    maxPricePence: number | null;
  },
  priceLockDays: number,
): Metadata {
  const upTo = m.maxPricePence
    ? ` Get up to ${formatPrice(m.maxPricePence, { whole: true })}.`
    : "";
  return pageMetadata({
    title: `Sell your ${m.brandName} ${m.name}`,
    description: `Instant quote for your ${m.brandName} ${m.name}.${upTo} Price locked for ${priceLockDays} days. Free postage or drop off in store.`,
    path: `/sell/${m.brandSlug}/${m.slug}`,
    image: "file",
  });
}

export type ProductMetadataInput = VariantOptions & {
  brand: string;
  brandSlug: string;
  model: string;
  slug: string;
  grade: Grade;
  status: "listed" | "reserved" | "sold";
  batteryHealthPercent: number | null;
  warrantyMonths: number;
  pricePence: number;
};

export function productMetadata(p: ProductMetadataInput): Metadata {
  const status = p.status === "sold" ? "Sold" : p.status === "reserved" ? "Reserved" : null;
  const battery =
    p.batteryHealthPercent === null ? "" : `, battery health ${p.batteryHealthPercent}%`;
  return pageMetadata({
    title: `${productTitle(p)}, Grade ${p.grade} refurbished${status ? ` (${status})` : ""}`,
    description: `Refurbished ${p.brand} ${p.model}, ${variantLabel(p)}. Grade ${p.grade} (${GRADE_INFO[p.grade].label})${battery}, ${p.warrantyMonths}-month warranty. ${formatPrice(p.pricePence)}.`,
    path: productPath(p),
    image: "file",
  });
}

export function storesIndexMetadata(): Metadata {
  return pageMetadata({
    title: "Our stores in North Shields and South Shields",
    description: `Visit ${siteConfig.name} in North Shields or South Shields: sell your phone over the counter, collect an order or see refurbished phones in person. Opening hours, parking and Metro.`,
    path: "/stores",
  });
}

export function storeMetadata(store: PublicStore): Metadata {
  const name = storeName(store);
  return pageMetadata({
    title: `${name}: phone shop, trade-ins and refurbished phones`,
    description: metaDescription(
      `${name}, ${storeAddress(store)}. Call ${store.phoneDisplay}. Sell your phone, buy refurbished with a warranty, or collect an order.`,
    ),
    path: storePath(store),
    image: "file",
  });
}

export function guidesIndexMetadata(): Metadata {
  return pageMetadata({
    title: "Guides: phone prices, wiping and grading",
    description:
      "How much your phone is worth today, how to wipe it before you sell it, and what refurbished grades mean. Live prices from our trade-in team.",
    path: "/guides",
  });
}

export function guideMetadata(guide: Guide): Metadata {
  return pageMetadata({
    title: guide.title,
    description: guide.description,
    path: guidePath(guide.slug),
    image: "file",
    type: "article",
    article: {
      publishedTime: guide.publishedAt,
      modifiedTime: guide.updatedAt,
      authors: [guide.author.name],
    },
  });
}
