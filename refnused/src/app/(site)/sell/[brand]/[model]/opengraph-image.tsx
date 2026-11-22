import { formatPrice } from "@refnused/database/lib/format";
import { OG_IMAGE_SIZE } from "@/lib/metadata";
import { OG_PICTURE_BOX, ogCard } from "@/lib/og/card";
import { cachedOgPicture } from "@/lib/og/image-source";
import { PRICE_LOCK_DAYS } from "@refnused/database/lib/sell/offer-service";
import { cachedSellModel } from "@/lib/sell/queries";

export const alt = "Sell your phone for cash at RefurbednUsed";
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ brand: string; model: string }>;
}) {
  const { brand, model } = await params;
  const m = await cachedSellModel(brand, model);
  if (!m) return new Response("Not found", { status: 404 });
  return ogCard({
    eyebrow: "Sell your phone",
    title: `Sell your ${m.brandName} ${m.name}`,
    subtitle: "Instant quote. Free postage, or drop it off in store.",
    highlight: m.maxPricePence
      ? `Up to ${formatPrice(m.maxPricePence, { whole: true })}`
      : undefined,
    pills: [`Price locked for ${PRICE_LOCK_DAYS} days`],
    picture: await cachedOgPicture(m.imageUrl, OG_PICTURE_BOX),
  });
}
