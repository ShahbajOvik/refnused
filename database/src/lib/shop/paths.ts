import { HERO_POSTER } from "../../config/hero";
import type { ProductPhoto } from "../../db/schema";
import { mediaUrl } from "../media";

import { variantLabel, type VariantOptions } from "./variant-label";

/** /shop/apple/iphone-15-128gb-black-k3x9q2 */
export function productPath(p: { brandSlug: string; slug: string }) {
  return `/shop/${p.brandSlug}/${p.slug}`;
}

/** "Apple iPhone 15, 128GB, Black" */
export function productTitle(p: { brand: string; model: string } & VariantOptions) {
  return `${p.brand} ${p.model}, ${variantLabel(p)}`;
}

/** The unit's first photo, else the model's image, else the generic phone. */
export function productImageSrc(p: { photo: ProductPhoto | null; modelImageUrl: string | null }) {
  if (p.photo) return mediaUrl(p.photo.key);
  return p.modelImageUrl ?? HERO_POSTER.src;
}
