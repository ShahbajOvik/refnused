import { mediaUrl } from "@refnused/database/lib/media";
import { OG_IMAGE_SIZE } from "@/lib/metadata";
import { OG_PICTURE_BOX, ogCard } from "@/lib/og/card";
import { cachedOgPicture } from "@/lib/og/image-source";
import { storeAddress, storeName } from "@refnused/database/lib/stores";
import { loadPublicStore } from "@/lib/stores-cache";

export const alt = "RefurbednUsed store";
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const store = await loadPublicStore((await params).slug);
  if (!store) return new Response("Not found", { status: 404 });
  const photo = store.photos[0];
  return ogCard({
    eyebrow: "Visit our store",
    title: storeName(store),
    subtitle: storeAddress(store),
    highlight: store.phoneDisplay,
    pills: ["Sell over the counter", "Click and collect"],
    picture: await cachedOgPicture(photo ? mediaUrl(photo.key) : null, OG_PICTURE_BOX),
  });
}
