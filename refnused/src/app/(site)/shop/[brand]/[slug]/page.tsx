import {
  BadgeCheckIcon,
  BatteryMediumIcon,
  CalendarIcon,
  HardDriveIcon,
  MapPinIcon,
  PaletteIcon,
  PhoneIcon,
  ShieldCheckIcon,
  StoreIcon,
  TruckIcon,
  Undo2Icon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AddToBasket } from "@/components/checkout/add-to-basket";
import { HERO_MODEL_URL } from "@/components/home/hero/config";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { ModelLinks } from "@/components/seo/model-links";
import { CompareToggle } from "@/components/shop/compare-toggle";
import { NotifyMeForm } from "@/components/shop/notify-me-form";
import { ProductCard } from "@/components/shop/product-card";
import { ProductGallery, type GalleryPhoto } from "@/components/shop/product-gallery";
import { TradeInCalculator } from "@/components/shop/trade-in-calculator";
import { ViewIn3D } from "@/components/shop/view-in-3d";
import { Badge, GradeBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CLICK_AND_COLLECT, DELIVERY_OPTIONS, RETURN_POLICY } from "@/config/shop";
import { publicEnv } from "@/lib/env";
import { formatDate, formatPrice, telHref } from "@/lib/format";
import { GRADE_INFO, GRADES } from "@/lib/grades";
import { mediaUrl } from "@/lib/media";
import { GRADING_GUIDE_SLUG, guidePath } from "@/lib/guides/slugs";
import { productMetadata } from "@/lib/metadata-templates";
import type { ProductDetail } from "@/lib/shop/catalogue";
import { productJsonLd, type ProductAvailability } from "@/lib/shop/json-ld";
import { orFallback } from "@/lib/shop/load";
import { productImageSrc, productPath, productTitle } from "@/lib/shop/paths";
import { batteryRating } from "@/lib/shop/product-info";
import { itemNoun, variantLabel } from "@/lib/shop/variant-label";
import {
  cachedProduct,
  cachedProductParams,
  cachedSimilar,
  cachedStockByStore,
  cachedTradeInModels,
} from "@/lib/shop/queries";
import { cn } from "@/lib/utils";

export async function generateStaticParams() {
  return cachedProductParams();
}

const AVAILABILITY: Record<ProductDetail["status"], ProductAvailability> = {
  listed: "in_stock",
  reserved: "reserved",
  sold: "sold",
};

function photosOf(p: ProductDetail): GalleryPhoto[] {
  if (p.photos.length) return p.photos.map((ph) => ({ src: mediaUrl(ph.key), alt: ph.alt }));
  return [{ src: productImageSrc(p), alt: `${p.brand} ${p.model} (photo coming soon)` }];
}

export async function generateMetadata({
  params,
}: PageProps<"/shop/[brand]/[slug]">): Promise<Metadata> {
  const { brand, slug } = await params;
  const p = await cachedProduct(brand, slug);
  return p ? productMetadata(p) : {};
}

export default function ProductPage({ params }: PageProps<"/shop/[brand]/[slug]">) {
  return (
    <div className="page-container py-8">
      <Suspense fallback={<ProductSkeleton />}>
        <Product params={params} />
      </Suspense>
    </div>
  );
}

function ProductSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="h-5 w-72" />
      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <Skeleton className="aspect-[4/5] rounded-2xl" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-64" />
        </div>
      </div>
    </div>
  );
}

async function Product({ params }: Pick<PageProps<"/shop/[brand]/[slug]">, "params">) {
  const { brand, slug } = await params;
  const p = await cachedProduct(brand, slug);
  if (!p) notFound();

  const forSale = p.status === "listed";
  const photos = photosOf(p);
  const title = productTitle(p);
  const noun = itemNoun(p.categorySlug);
  const [stock, similar, tradeInModels] = await Promise.all([
    orFallback("stock", () => cachedStockByStore(p.modelId, p.variantId), []),
    orFallback(
      "similar",
      () =>
        cachedSimilar({
          excludeId: p.id,
          categoryId: p.categoryId,
          modelId: p.modelId,
          brandId: p.brandId,
          pricePence: p.pricePence,
        }),
      [],
    ),
    forSale ? orFallback("trade-in models", cachedTradeInModels, []) : Promise.resolve([]),
  ]);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Shop", href: "/shop" },
          { label: p.brand, href: `/shop/${p.brandSlug}` },
          { label: `${p.model} ${variantLabel(p, " ")}`, href: productPath(p) },
        ]}
      />
      <JsonLd
        data={productJsonLd({
          path: productPath(p),
          sku: p.slug,
          brand: p.brand,
          model: p.model,
          storageGb: p.storageGb,
          configuration: p.configuration,
          colour: p.colour,
          grade: p.grade,
          batteryHealthPercent: p.batteryHealthPercent,
          warrantyMonths: p.warrantyMonths,
          pricePence: p.pricePence,
          availability: AVAILABILITY[p.status],
          images: photos.map((ph) => ph.src),
          store: { slug: p.storeSlug, name: p.storeName },
        })}
      />

      <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="flex flex-col gap-4">
          <ProductGallery photos={photos} />
          <div className="flex flex-wrap items-center gap-3">
            {/* The stand-in 3D model is a phone, so other items need their own. */}
            {p.model3dUrl || p.categorySlug === "phones" ? (
              <ViewIn3D
                modelUrl={p.model3dUrl ?? HERO_MODEL_URL}
                modelName={`${p.brand} ${p.model}`}
              />
            ) : null}
            {p.photos.length ? (
              <p className="text-sm text-muted-foreground">Photos are of this exact {noun.one}.</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <GradeBadge grade={p.grade} />
              {p.status !== "listed" ? (
                <Badge variant="secondary">{p.status === "sold" ? "Sold" : "Reserved"}</Badge>
              ) : null}
            </div>
            <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{title}</h1>
            <p className="mt-1 text-muted-foreground">
              Refurbished · {p.dataWipeRequired ? "Tested and data-wiped" : "Tested"}
            </p>
          </div>

          {forSale ? (
            <div className="flex flex-col gap-3">
              <p className="text-4xl font-semibold" data-testid="product-price">
                {formatPrice(p.pricePence)}
              </p>
              <p className="flex items-center gap-2 text-sm">
                <MapPinIcon className="size-4 text-primary" aria-hidden />
                In stock at {p.storeName}, {p.storeTown}
              </p>
              <AddToBasket productId={p.id} />
              <div className="flex flex-wrap items-center gap-3">
                <CompareToggle slug={p.slug} name={title} className="min-h-11 px-4 text-sm" />
                <a
                  href={telHref(p.store.phone)}
                  className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  <PhoneIcon className="size-4" aria-hidden />
                  Questions? Call {p.storeName}, {p.storeTown}
                </a>
              </div>
            </div>
          ) : (
            <SoldNotice product={p} />
          )}

          <KeyFacts product={p} />
        </div>
      </div>

      {forSale ? null : (
        <SimilarPhones
          products={similar}
          title={`Similar ${noun.many} in stock`}
          noun={noun.many}
          className="mt-12"
          emptyText="Nothing similar is in stock right now. Sign up above and we’ll email you."
        />
      )}

      <div className="mt-12 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="condition-heading" className="rounded-2xl border p-6">
          <h2 id="condition-heading" className="text-xl font-semibold">
            Condition: Grade {p.grade}, {GRADE_INFO[p.grade].label.toLowerCase()}
          </h2>
          <p className="mt-2 text-muted-foreground">
            Grades describe how a {noun.one} looks. Every grade is fully tested and works like new.{" "}
            <Link
              href={guidePath(GRADING_GUIDE_SLUG)}
              className="font-medium text-primary underline underline-offset-4"
            >
              Grading explained
            </Link>
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {GRADES.map((g) => (
              <li
                key={g}
                aria-current={g === p.grade ? "true" : undefined}
                className={cn(
                  "rounded-xl border p-4",
                  g === p.grade && "border-primary bg-primary/5",
                )}
              >
                <p className="font-medium">
                  Grade {g} · {GRADE_INFO[g].label}
                  {g === p.grade ? <span className="text-primary"> (this {noun.one})</span> : null}
                </p>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-sm text-muted-foreground">
                  <dt className="font-medium text-foreground">Screen</dt>
                  <dd>{GRADE_INFO[g].details.screen}</dd>
                  <dt className="font-medium text-foreground">Body</dt>
                  <dd>{GRADE_INFO[g].details.body}</dd>
                </dl>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex flex-col gap-8">
          {p.batteryHealthPercent !== null ? (
            <BatterySection percent={p.batteryHealthPercent} noun={noun.one} />
          ) : null}
          <section aria-labelledby="warranty-heading" className="rounded-2xl border p-6">
            <h2 id="warranty-heading" className="flex items-center gap-2 text-xl font-semibold">
              <ShieldCheckIcon className="size-5 text-primary" aria-hidden />
              {p.warrantyMonths}-month warranty
            </h2>
            <p className="mt-2 text-muted-foreground">
              If it develops a fault within {p.warrantyMonths} months, we’ll repair or replace it
              free of charge. Accidental damage isn’t covered.{" "}
              <Link
                href="/warranty"
                className="font-medium text-primary underline underline-offset-4"
              >
                Warranty details
              </Link>
            </p>
          </section>
        </div>
      </div>

      {p.status !== "sold" ? (
        <section aria-labelledby="delivery-heading" className="mt-12">
          <h2 id="delivery-heading" className="text-2xl font-semibold">
            Delivery and collection
          </h2>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border p-6">
              <h3 className="flex items-center gap-2 font-semibold">
                <TruckIcon className="size-5 text-primary" aria-hidden /> Delivery
              </h3>
              <ul className="mt-3 flex flex-col gap-3 text-sm">
                {DELIVERY_OPTIONS.map((option) => (
                  <li key={option.key}>
                    <p className="font-medium">
                      {option.label} ·{" "}
                      {option.pricePence === 0 ? "Free" : formatPrice(option.pricePence)}
                    </p>
                    <p className="text-muted-foreground">{option.description}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border p-6">
              <h3 className="flex items-center gap-2 font-semibold">
                <StoreIcon className="size-5 text-primary" aria-hidden /> Click and collect
              </h3>
              <p className="mt-3 text-sm font-medium">
                {p.store.name}, {p.store.street}, {p.store.town} {p.store.postcode}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{CLICK_AND_COLLECT.description}</p>
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Undo2Icon className="size-4" aria-hidden />
                {RETURN_POLICY.days}-day {RETURN_POLICY.freeReturns ? "free " : ""}returns, by post
                or in store.{" "}
                <Link
                  href="/returns"
                  className="font-medium text-primary underline underline-offset-4"
                >
                  Returns
                </Link>
              </p>
            </div>
            <StockPerStore product={p} stock={stock} />
          </div>
        </section>
      ) : null}

      {forSale && tradeInModels.length ? (
        <section
          aria-labelledby="trade-in-heading"
          className="mt-12 rounded-2xl border bg-muted/30 p-6 sm:p-8"
        >
          <h2 id="trade-in-heading" className="text-2xl font-semibold">
            Trade in and save
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Sell us your current phone and put the money towards this one. See what you could save
            in a few seconds.
          </p>
          <div className="mt-6 max-w-3xl">
            <TradeInCalculator productId={p.id} models={tradeInModels} />
          </div>
        </section>
      ) : null}

      {forSale ? (
        <SimilarPhones
          products={similar}
          title="You might also like"
          noun={noun.many}
          className="mt-12"
        />
      ) : null}

      <ModelLinks models={[p.modelSlug]} currentPath={productPath(p)} className="mt-12" />
    </>
  );
}

function KeyFacts({ product: p }: { product: ProductDetail }) {
  const facts = [
    {
      icon: BadgeCheckIcon,
      label: "Condition",
      value: `Grade ${p.grade} · ${GRADE_INFO[p.grade].label}`,
    },
    ...(p.batteryHealthPercent !== null
      ? [
          {
            icon: BatteryMediumIcon,
            label: "Battery health",
            value: `${p.batteryHealthPercent}% · ${batteryRating(p.batteryHealthPercent).label}`,
          },
        ]
      : []),
    { icon: ShieldCheckIcon, label: "Warranty", value: `${p.warrantyMonths} months` },
    ...(p.storageGb ? [{ icon: HardDriveIcon, label: "Storage", value: `${p.storageGb}GB` }] : []),
    ...(p.configuration
      ? [{ icon: BadgeCheckIcon, label: "Specification", value: p.configuration }]
      : []),
    { icon: PaletteIcon, label: "Colour", value: p.colour },
    { icon: CalendarIcon, label: "Released", value: String(p.releaseYear) },
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-2xl border p-5 sm:grid-cols-2">
      {facts.map(({ icon: Icon, label, value }) => (
        <div key={label}>
          <dt className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon className="size-5 shrink-0 text-primary" aria-hidden />
            {label}
          </dt>
          <dd className="pl-7 font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SoldNotice({ product: p }: { product: ProductDetail }) {
  const noun = itemNoun(p.categorySlug).one;
  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-muted/40 p-6">
      <div>
        <p className="text-xl font-semibold">
          {p.status === "sold" ? `Sorry, this ${noun} has sold` : `This ${noun} is reserved`}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {p.status === "sold"
            ? `It sold${p.soldAt ? ` on ${formatDate(p.soldAt)}` : ""} for ${formatPrice(p.pricePence)}.`
            : `Someone’s collecting it. If they don’t, it’ll be back on sale at ${formatPrice(p.pricePence)}.`}{" "}
          We get new stock every day.
        </p>
      </div>
      <section aria-labelledby="notify-heading">
        <h2 id="notify-heading" className="font-semibold">
          Get an email when one is in stock
        </h2>
        <div className="mt-3">
          <NotifyMeForm
            productId={p.id}
            modelName={p.model}
            storageGb={p.storageGb}
            turnstileSiteKey={publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          />
        </div>
      </section>
    </div>
  );
}

function BatterySection({ percent, noun }: { percent: number; noun: string }) {
  const rating = batteryRating(percent);
  return (
    <section aria-labelledby="battery-heading" className="rounded-2xl border p-6">
      <h2 id="battery-heading" className="flex items-center gap-2 text-xl font-semibold">
        <BatteryMediumIcon className="size-5 text-primary" aria-hidden />
        Battery health: {percent}%
      </h2>
      <meter
        min={0}
        max={100}
        low={80}
        high={90}
        optimum={100}
        value={percent}
        aria-label="Battery health"
        aria-valuetext={`${percent}%, ${rating.label}`}
        className="mt-4 h-3 w-full"
      />
      <p className="mt-3">
        <strong>{rating.label}.</strong> {rating.description}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Battery health is how much charge the battery holds compared with when it was new. We
        measure it when we test every {noun}.
      </p>
    </section>
  );
}

function StockPerStore({
  product: p,
  stock,
}: {
  product: ProductDetail;
  stock: Awaited<ReturnType<typeof cachedStockByStore>>;
}) {
  if (!stock.length) return null;
  const noun = itemNoun(p.categorySlug);
  return (
    <div className="rounded-2xl border p-6">
      <h3 className="flex items-center gap-2 font-semibold">
        <MapPinIcon className="size-5 text-primary" aria-hidden /> Stock in our stores
      </h3>
      <table className="mt-3 w-full text-sm">
        <caption className="sr-only">
          {p.model} {noun.many} in stock at each store, including this one
        </caption>
        <thead>
          <tr className="text-left text-muted-foreground">
            <th scope="col" className="py-1 font-normal">
              Store
            </th>
            <th scope="col" className="py-1 pl-3 text-right font-normal">
              {variantLabel(p, " ")}
            </th>
            <th scope="col" className="py-1 pl-3 text-right font-normal">
              Any {p.model}
            </th>
          </tr>
        </thead>
        <tbody>
          {stock.map((s) => (
            <tr key={s.storeSlug} className="border-t">
              <th scope="row" className="py-2 text-left font-medium">
                {s.modelCount > 0 ? (
                  <Link
                    href={`/shop/${p.brandSlug}?model=${p.modelSlug}&store=${s.storeSlug}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {s.storeName}, {s.storeTown}
                  </Link>
                ) : (
                  `${s.storeName}, ${s.storeTown}`
                )}
                {s.storeSlug === p.storeSlug && p.status === "listed" ? (
                  <span className="block text-xs font-normal text-muted-foreground">
                    This {noun.one} is here
                  </span>
                ) : null}
              </th>
              <td className="py-2 text-right tabular-nums">{s.variantCount}</td>
              <td className="py-2 text-right tabular-nums">{s.modelCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SimilarPhones({
  products,
  title,
  noun = "phones",
  className,
  emptyText,
}: {
  products: Awaited<ReturnType<typeof cachedSimilar>>;
  title: string;
  noun?: string;
  className?: string;
  emptyText?: string;
}) {
  if (!products.length && !emptyText) return null;
  return (
    <section aria-labelledby="similar-heading" className={className}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="similar-heading" className="text-2xl font-semibold">
          {title}
        </h2>
        <Link
          href="/shop"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Shop all {noun}
        </Link>
      </div>
      {products.length ? (
        <ul className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 lg:gap-6">
          {products.map((item) => (
            <li key={item.id}>
              <ProductCard product={item} compare sizes="(min-width: 768px) 22vw, 45vw" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-muted-foreground">{emptyText}</p>
      )}
    </section>
  );
}
