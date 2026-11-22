import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { HERO_POSTER } from "@/components/home/hero/config";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/format";
import { sellBrandMetadata } from "@/lib/metadata-templates";
import { cachedBrand, cachedBrandModels, cachedSellBrands } from "@/lib/sell/queries";

export async function generateStaticParams() {
  const brands = await cachedSellBrands();
  return brands.map((b) => ({ brand: b.slug }));
}

export async function generateMetadata({ params }: PageProps<"/sell/[brand]">): Promise<Metadata> {
  const brand = await cachedBrand((await params).brand);
  return brand ? sellBrandMetadata(brand) : {};
}

export default function SellBrandPage({ params }: PageProps<"/sell/[brand]">) {
  return (
    <div className="page-container py-8">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <BrandModels params={params} />
      </Suspense>
    </div>
  );
}

async function BrandModels({ params }: Pick<PageProps<"/sell/[brand]">, "params">) {
  const { brand: slug } = await params;
  const [brand, models] = await Promise.all([cachedBrand(slug), cachedBrandModels(slug)]);
  if (!brand) notFound();

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Sell", href: "/sell" },
          { label: brand.name, href: `/sell/${brand.slug}` },
        ]}
      />
      <h1 className="mt-6 text-4xl font-semibold">Sell your {brand.name} phone</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        Choose your model to get an instant quote.
      </p>
      <ul className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {models.map((m) => (
          <li key={m.slug}>
            <Link
              href={`/sell/${brand.slug}/${m.slug}`}
              className="flex h-full flex-col items-center gap-3 rounded-2xl border bg-card p-4 text-center transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Image
                src={m.imageUrl ?? HERO_POSTER.src}
                alt=""
                width={96}
                height={120}
                className="h-28 w-auto object-contain"
              />
              <span className="font-semibold">{m.name}</span>
              {m.maxPricePence ? (
                <span className="text-sm text-muted-foreground">
                  Up to{" "}
                  <strong className="text-foreground">
                    {formatPrice(m.maxPricePence, { whole: true })}
                  </strong>
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
