import { HERO_POSTER } from "@refnused/database/config/hero";
import { DEFAULT_OG_IMAGE, OG_IMAGE_SIZE } from "@/lib/metadata";
import { OG_PICTURE_BOX, ogCard } from "@/lib/og/card";
import { cachedOgPicture } from "@/lib/og/image-source";

/** Site-wide Open Graph image, at /opengraph-image (DEFAULT_OG_IMAGE). */
export const alt = DEFAULT_OG_IMAGE.alt;
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return ogCard({
    eyebrow: "North Shields · South Shields · Online",
    title: "Sell your phone for cash. Buy refurbished with confidence.",
    subtitle: "Instant trade-in quotes, graded phones with a warranty.",
    pills: ["Free postage", "Price locked", "12-month warranty"],
    picture: await cachedOgPicture(HERO_POSTER.src, OG_PICTURE_BOX),
  });
}
