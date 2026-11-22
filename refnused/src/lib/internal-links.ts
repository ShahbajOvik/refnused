import { formatPrice } from "@/lib/format";
import type { ModelLinkTarget } from "@/lib/guides/catalogue";
import {
  guidePath,
  GRADING_GUIDE_SLUG,
  modelValueGuidePath,
  WIPE_GUIDE_SLUG,
} from "@/lib/guides/slugs";
import type { GuideSummary } from "@/lib/guides/types";
import { EMPTY_FILTERS, shopHref } from "@/lib/shop/filters";
import { itemNoun } from "@/lib/shop/variant-label";

/*
 * Internal links between the sell, shop and guide pages for a model. Pure.
 * A link is only made when its page has something on it: the sell page and
 * price guide when we buy the model, the shop listing when units are in stock.
 */

export type InternalLink = {
  kind: "sell" | "shop" | "guide";
  href: string;
  label: string;
  detail?: string;
};

export type ModelLinkGroup = { model: ModelLinkTarget; links: InternalLink[] };

export function sellModelPath(m: Pick<ModelLinkTarget, "brandSlug" | "slug">): string {
  return `/sell/${m.brandSlug}/${m.slug}`;
}

/** /shop/apple?model=iphone-15 */
export function shopModelPath(m: Pick<ModelLinkTarget, "brandSlug" | "slug">): string {
  return shopHref({ ...EMPTY_FILTERS, models: [m.slug] }, `/shop/${m.brandSlug}`);
}

export function modelLinks(
  m: ModelLinkTarget,
  options: { guides?: GuideSummary[]; exclude?: string } = {},
): InternalLink[] {
  const name = `${m.brandName} ${m.name}`;
  const noun = itemNoun(m.categorySlug);
  const links: InternalLink[] = [];

  if (m.maxTradeInPence) {
    links.push({
      kind: "sell",
      href: sellModelPath(m),
      label: `Sell your ${name}`,
      detail: `Up to ${formatPrice(m.maxTradeInPence, { whole: true })}`,
    });
  }
  if (m.inStock > 0) {
    links.push({
      kind: "shop",
      href: shopModelPath(m),
      label: `Buy a refurbished ${name}`,
      detail: `${m.inStock} in stock${m.fromPricePence ? ` from ${formatPrice(m.fromPricePence)}` : ""}`,
    });
  }
  if (m.maxTradeInPence) {
    links.push({
      kind: "guide",
      href: modelValueGuidePath(m.slug),
      label: `How much is my ${name} worth?`,
      detail: "Today’s prices by storage and condition",
    });
  }
  for (const g of options.guides ?? []) {
    if (g.template === "article" && g.relatedModels.includes(m.slug)) {
      links.push({ kind: "guide", href: guidePath(g.slug), label: g.title });
    }
  }
  // General guides that fit what's on offer for this model.
  if (m.maxTradeInPence) {
    links.push({
      kind: "guide",
      href: guidePath(WIPE_GUIDE_SLUG),
      label: `How to wipe your ${noun.one} before you sell it`,
    });
  }
  if (m.inStock > 0) {
    links.push({
      kind: "guide",
      href: guidePath(GRADING_GUIDE_SLUG),
      label: "Grading explained: what Grade A, B and C mean",
    });
  }

  const seen = new Set<string>(options.exclude ? [options.exclude] : []);
  return links.filter((link) => {
    if (seen.has(link.href)) return false;
    seen.add(link.href);
    return true;
  });
}
