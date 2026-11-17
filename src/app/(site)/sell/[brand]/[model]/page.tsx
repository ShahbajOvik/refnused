import { BadgeCheckIcon, LockIcon, TruckIcon } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { HERO_POSTER } from "@/components/home/hero/config";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { SellWizard } from "@/components/sell/sell-wizard";
import { Skeleton } from "@/components/ui/skeleton";
import { publicEnv } from "@/lib/env";
import { formatPrice } from "@/lib/format";
import { PRICE_LOCK_DAYS } from "@/lib/sell/offer-service";
import {
  cachedDropOffStores,
  cachedModelParams,
  cachedPublicQuestions,
  cachedSellModel,
} from "@/lib/sell/queries";

export async function generateStaticParams() {
  return cachedModelParams();
}

export async function generateMetadata({
  params,
}: PageProps<"/sell/[brand]/[model]">): Promise<Metadata> {
  const { brand, model } = await params;
  const m = await cachedSellModel(brand, model);
  if (!m) return {};
  const upTo = m.maxPricePence
    ? ` Get up to ${formatPrice(m.maxPricePence, { whole: true })}.`
    : "";
  return {
    title: `Sell your ${m.brandName} ${m.name}`,
    description: `Instant quote for your ${m.brandName} ${m.name}.${upTo} Price locked for ${PRICE_LOCK_DAYS} days.`,
    alternates: { canonical: `/sell/${m.brandSlug}/${m.slug}` },
  };
}

export default function SellModelPage({ params }: PageProps<"/sell/[brand]/[model]">) {
  return (
    <div className="page-container py-8">
      <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
        <ModelQuote params={params} />
      </Suspense>
    </div>
  );
}

async function ModelQuote({ params }: Pick<PageProps<"/sell/[brand]/[model]">, "params">) {
  const { brand, model } = await params;
  const [m, questions, stores] = await Promise.all([
    cachedSellModel(brand, model),
    cachedPublicQuestions(),
    cachedDropOffStores(),
  ]);
  if (!m || m.variants.length === 0) notFound();

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Sell", href: "/sell" },
          { label: m.brandName, href: `/sell/${m.brandSlug}` },
          { label: m.name, href: `/sell/${m.brandSlug}/${m.slug}` },
        ]}
      />
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold sm:text-4xl">
            Sell your {m.brandName} {m.name}
          </h1>
          {m.maxPricePence ? (
            <p className="text-lg">
              Get up to <strong>{formatPrice(m.maxPricePence, { whole: true })}</strong>
            </p>
          ) : null}
          <Image
            src={m.imageUrl ?? HERO_POSTER.src}
            alt=""
            width={240}
            height={300}
            className="hidden h-64 w-auto object-contain lg:block"
          />
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <LockIcon className="size-4 text-primary" aria-hidden /> Price locked for{" "}
              {PRICE_LOCK_DAYS} days
            </li>
            <li className="flex items-center gap-2">
              <TruckIcon className="size-4 text-primary" aria-hidden /> Free postage, or drop off in
              store
            </li>
            <li className="flex items-center gap-2">
              <BadgeCheckIcon className="size-4 text-primary" aria-hidden /> Paid by bank transfer
              once checked
            </li>
          </ul>
        </div>
        <SellWizard
          model={{ name: m.name, brandName: m.brandName }}
          variants={m.variants}
          questions={questions}
          stores={stores}
          priceLockDays={PRICE_LOCK_DAYS}
          turnstileSiteKey={publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        />
      </div>
    </>
  );
}
