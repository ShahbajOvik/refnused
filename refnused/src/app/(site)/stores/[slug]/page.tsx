import { CarIcon, MailIcon, StarIcon, TrainFrontIcon } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { ProductCard } from "@/components/shop/product-card";
import { OpenNow } from "@/components/stores/open-now";
import { OpeningHoursTable } from "@/components/stores/opening-hours";
import { StoreActions, StoreAddress } from "@/components/stores/store-actions";
import { StoreMap } from "@/components/stores/store-map";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { storeMetadata } from "@/lib/metadata-templates";
import { storeJsonLd } from "@/lib/seo";
import { EMPTY_FILTERS, shopHref } from "@/lib/shop/filters";
import { type PublicStore, storeAddress, storeName, storePath } from "@/lib/stores";
import {
  loadPublicStore,
  loadPublicStores,
  loadStoreReviews,
  loadStoreStock,
} from "@/lib/stores-cache";

export async function generateStaticParams() {
  return (await loadPublicStores()).map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: PageProps<"/stores/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const store = await loadPublicStore(slug);
  return store ? storeMetadata(store) : {};
}

export default function StorePage({ params }: PageProps<"/stores/[slug]">) {
  return (
    <div className="page-container py-8">
      <Suspense fallback={<Skeleton className="h-[40rem] w-full rounded-2xl" />}>
        <Store params={params} />
      </Suspense>
    </div>
  );
}

const linkClass =
  "font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm";

async function Store({ params }: Pick<PageProps<"/stores/[slug]">, "params">) {
  const { slug } = await params;
  const store = await loadPublicStore(slug);
  if (!store) notFound();
  const name = storeName(store);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Stores", href: "/stores" },
          { label: name, href: storePath(store) },
        ]}
      />
      <h1 className="mt-6 text-4xl font-semibold sm:text-5xl">{name}</h1>
      <OpenNow hours={store.openingHours} className="mt-3 text-base" />

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_24rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {store.photos.length ? <StorePhotos store={store} /> : null}
          <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border bg-muted/40">
            <StoreMap name={name} address={storeAddress(store)} />
          </div>
        </div>

        <aside aria-label="Store details" className="flex flex-col gap-6">
          <section aria-labelledby="contact-heading" className="rounded-2xl border p-6">
            <h2 id="contact-heading" className="text-lg font-semibold">
              Address and phone
            </h2>
            <StoreAddress store={store} className="mt-2 text-muted-foreground not-italic" />
            <p className="mt-2 font-medium">{store.phoneDisplay}</p>
            {store.email ? (
              <p className="mt-1">
                <a
                  href={`mailto:${store.email}`}
                  className={`inline-flex min-h-9 items-center gap-2 ${linkClass}`}
                >
                  <MailIcon className="size-4" aria-hidden />
                  {store.email}
                </a>
              </p>
            ) : null}
            <div className="mt-4">
              <StoreActions store={store} />
            </div>
          </section>

          <section aria-labelledby="hours-heading" className="rounded-2xl border p-6">
            <h2 id="hours-heading" className="mb-2 text-lg font-semibold">
              Opening hours
            </h2>
            <OpeningHoursTable hours={store.openingHours} />
          </section>

          {store.parkingInfo || store.nearestMetro ? (
            <section aria-labelledby="getting-here-heading" className="rounded-2xl border p-6">
              <h2 id="getting-here-heading" className="text-lg font-semibold">
                Getting here
              </h2>
              <dl className="mt-3 flex flex-col gap-3 text-sm">
                {store.parkingInfo ? (
                  <div>
                    <dt className="flex items-center gap-2 font-medium">
                      <CarIcon className="size-5 shrink-0 text-primary" aria-hidden />
                      Parking
                    </dt>
                    <dd className="mt-0.5 pl-7 text-muted-foreground">{store.parkingInfo}</dd>
                  </div>
                ) : null}
                {store.nearestMetro ? (
                  <div>
                    <dt className="flex items-center gap-2 font-medium">
                      <TrainFrontIcon className="size-5 shrink-0 text-primary" aria-hidden />
                      Nearest Metro
                    </dt>
                    <dd className="mt-0.5 pl-7 text-muted-foreground">{store.nearestMetro}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}
        </aside>
      </div>

      <Suspense fallback={<Skeleton className="mt-12 h-72 rounded-2xl" />}>
        <StoreStock store={store} />
      </Suspense>
      <Suspense fallback={<Skeleton className="mt-12 h-48 rounded-2xl" />}>
        <StoreReviews store={store} />
      </Suspense>

      <JsonLd data={storeJsonLd(store)} />
    </>
  );
}

function StorePhotos({ store }: { store: PublicStore }) {
  const [first, ...rest] = store.photos;
  return (
    <ul
      aria-label={`Photos of ${storeName(store)}`}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3"
    >
      {[first!, ...rest].map((photo, index) => (
        <li
          key={photo.key}
          className={
            index === 0
              ? "relative col-span-2 aspect-[16/10] overflow-hidden rounded-2xl border sm:col-span-3"
              : "relative aspect-[4/3] overflow-hidden rounded-xl border"
          }
        >
          <Image
            src={mediaUrl(photo.key)}
            alt={photo.alt}
            fill
            priority={index === 0}
            sizes={
              index === 0 ? "(min-width: 1024px) 60vw, 100vw" : "(min-width: 1024px) 20vw, 50vw"
            }
            className="object-cover"
          />
        </li>
      ))}
    </ul>
  );
}

async function StoreStock({ store }: { store: PublicStore }) {
  const stock = await loadStoreStock(store.slug);
  const storeShopHref = shopHref({ ...EMPTY_FILTERS, stores: [store.slug] });
  return (
    <section aria-labelledby="stock-heading" className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="stock-heading" className="text-2xl font-semibold">
            In stock at {storeName(store)}
          </h2>
          <p className="mt-1 text-muted-foreground">
            {stock === null
              ? "We couldn’t load this store’s stock just now."
              : stock.total === 0
                ? "No phones on the shelf here right now. We can deliver from our other stores."
                : `${stock.total} refurbished ${stock.total === 1 ? "phone" : "phones"} you can see and buy here, or reserve online and collect.`}
          </p>
        </div>
        {stock && stock.total > 0 ? (
          <Link href={storeShopHref} className={`inline-flex min-h-11 items-center ${linkClass}`}>
            See all {stock.total} at this store
          </Link>
        ) : (
          <Link href="/shop" className={`inline-flex min-h-11 items-center ${linkClass}`}>
            Browse all phones
          </Link>
        )}
      </div>
      {stock?.items.length ? (
        <ul className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {stock.items.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <StarIcon
          key={i}
          className={
            i < Math.round(rating)
              ? "size-4 fill-warning text-warning"
              : "size-4 text-muted-foreground/40"
          }
        />
      ))}
    </span>
  );
}

async function StoreReviews({ store }: { store: PublicStore }) {
  const reviews = await loadStoreReviews(store.slug);
  return (
    <section aria-labelledby="reviews-heading" className="mt-12">
      <h2 id="reviews-heading" className="text-2xl font-semibold">
        Reviews of {storeName(store)}
      </h2>
      {reviews.count && reviews.average !== null ? (
        <>
          <p className="mt-2 flex items-center gap-2 text-muted-foreground">
            <Stars rating={reviews.average} />
            <span>
              {reviews.average.toFixed(1)} out of 5 from {reviews.count}{" "}
              {reviews.count === 1 ? "review" : "reviews"}
            </span>
          </p>
          <ul className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {reviews.items.map((review) => (
              <li key={review.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-6">
                <p className="flex items-center gap-2">
                  <Stars rating={review.rating} />
                  <span className="sr-only">{review.rating} out of 5 stars</span>
                </p>
                {review.title ? <h3 className="font-semibold">{review.title}</h3> : null}
                <blockquote className="text-muted-foreground">{review.body}</blockquote>
                <p className="mt-auto text-sm">
                  {review.displayName}
                  {review.isVerified ? " · Verified customer" : ""}
                  {review.publishedAt ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {formatDate(review.publishedAt)}
                    </span>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-muted-foreground">
          No reviews of this store yet. Reviews from customers who’ve visited will appear here.
        </p>
      )}
    </section>
  );
}
