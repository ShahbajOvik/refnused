import { HERO_POSTER } from "@/components/home/hero/config";
import { formatDate, formatPrice } from "@/lib/format";
import { cachedGuide } from "@/lib/guides/queries";
import { OG_IMAGE_SIZE } from "@/lib/metadata";
import { OG_PICTURE_BOX, ogCard } from "@/lib/og/card";
import { cachedOgPicture } from "@/lib/og/image-source";

export const alt = "RefurbednUsed guide";
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const page = await cachedGuide((await params).slug);
  if (!page) return new Response("Not found", { status: 404 });
  const { guide, modelValue } = page;
  const top = modelValue?.table.top;
  return ogCard({
    eyebrow: "Guide",
    title: guide.title,
    subtitle: modelValue
      ? `Live trade-in prices, updated ${formatDate(new Date(guide.updatedAt))}`
      : guide.description,
    highlight: top ? `Up to ${formatPrice(top.pricePence, { whole: true })}` : undefined,
    picture: await cachedOgPicture(
      guide.image?.url ?? modelValue?.model.imageUrl ?? (modelValue ? HERO_POSTER.src : null),
      OG_PICTURE_BOX,
    ),
  });
}
