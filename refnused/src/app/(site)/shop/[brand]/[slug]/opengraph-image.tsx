import { formatPrice } from "@/lib/format";
import { GRADE_INFO } from "@/lib/grades";
import { mediaUrl } from "@/lib/media";
import { OG_IMAGE_SIZE } from "@/lib/metadata";
import { OG_PICTURE_BOX, ogCard } from "@/lib/og/card";
import { cachedOgPicture } from "@/lib/og/image-source";
import { productImageSrc, productTitle } from "@/lib/shop/paths";
import { cachedProduct } from "@/lib/shop/queries";

export const alt = "Refurbished phone at RefurbednUsed";
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ brand: string; slug: string }>;
}) {
  const { brand, slug } = await params;
  const p = await cachedProduct(brand, slug);
  if (!p) return new Response("Not found", { status: 404 });
  const photo = p.photos[0]
    ? mediaUrl(p.photos[0].key)
    : productImageSrc({ photo: null, modelImageUrl: p.modelImageUrl });
  const status = p.status === "sold" ? "Sold" : p.status === "reserved" ? "Reserved" : null;
  return ogCard({
    eyebrow: status ? `Refurbished · ${status}` : "Refurbished",
    title: productTitle(p),
    highlight: status ? undefined : formatPrice(p.pricePence),
    pills: [
      `Grade ${p.grade} · ${GRADE_INFO[p.grade].label}`,
      ...(p.batteryHealthPercent === null ? [] : [`Battery ${p.batteryHealthPercent}%`]),
      `${p.warrantyMonths}-month warranty`,
    ],
    picture: await cachedOgPicture(photo, OG_PICTURE_BOX),
  });
}
