import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { GradingGuide } from "@/components/guides/grading-guide";
import { GuideByline } from "@/components/guides/guide-byline";
import { ModelValueGuide } from "@/components/guides/model-value-guide";
import { GuideBody } from "@/components/guides/portable-text";
import { WipeGuide } from "@/components/guides/wipe-guide";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { ModelLinks } from "@/components/seo/model-links";
import { Skeleton } from "@/components/ui/skeleton";
import { cachedGuide, cachedGuideSummaries, cachedQuoteQuestionTitles } from "@/lib/guides/queries";
import { guidePath, isGuideSlug } from "@/lib/guides/slugs";
import { DEFAULT_OG_IMAGE } from "@/lib/metadata";
import { guideMetadata } from "@/lib/metadata-templates";
import { articleJsonLd } from "@/lib/seo";
import { orFallback } from "@/lib/shop/load";

export async function generateStaticParams() {
  const guides = await orFallback("guide params", cachedGuideSummaries, []);
  return guides.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  if (!isGuideSlug(slug)) return {};
  const page = await cachedGuide(slug);
  return page ? guideMetadata(page.guide) : {};
}

export default function GuidePage({ params }: PageProps<"/guides/[slug]">) {
  return (
    <div className="page-container py-8">
      <Suspense fallback={<Skeleton className="h-[40rem] w-full rounded-2xl" />}>
        <Guide params={params} />
      </Suspense>
    </div>
  );
}

const EYEBROW = {
  "model-value": "Phone prices",
  wipe: "Selling your phone",
  grading: "Buying refurbished",
  article: "Guide",
} as const;

async function Guide({ params }: Pick<PageProps<"/guides/[slug]">, "params">) {
  const { slug } = await params;
  if (!isGuideSlug(slug)) notFound();
  const page = await cachedGuide(slug);
  if (!page) notFound();
  const { guide } = page;
  const path = guidePath(guide.slug);
  const questionTitles = page.modelValue
    ? await orFallback("quote questions", cachedQuoteQuestionTitles, [])
    : [];
  const about = page.modelValue
    ? [`${page.modelValue.model.brandName} ${page.modelValue.model.name}`]
    : [];

  return (
    <article className="mx-auto max-w-3xl">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Guides", href: "/guides" },
          { label: guide.title, href: path },
        ]}
      />
      <header className="mt-6">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">
          {EYEBROW[guide.template]}
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-balance sm:text-4xl">{guide.title}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{guide.description}</p>
        <GuideByline
          author={guide.author}
          publishedAt={guide.publishedAt}
          updatedAt={guide.updatedAt}
          live={guide.template === "model-value"}
        />
      </header>

      {guide.image ? (
        <Image
          src={guide.image.url}
          alt={guide.image.alt}
          width={guide.image.width ?? 1200}
          height={guide.image.height ?? 675}
          sizes="(min-width: 768px) 48rem, 100vw"
          priority
          className="mt-8 h-auto w-full rounded-2xl"
        />
      ) : null}

      {page.modelValue ? (
        <ModelValueGuide content={page.modelValue} questionTitles={questionTitles} />
      ) : guide.template === "wipe" ? (
        <WipeGuide />
      ) : guide.template === "grading" ? (
        <GradingGuide />
      ) : null}

      {guide.body ? (
        <div className={guide.template === "article" ? "mt-8" : "mt-10 border-t pt-2"}>
          <GuideBody value={guide.body} />
        </div>
      ) : null}

      <ModelLinks
        models={guide.relatedModels}
        currentPath={path}
        className="mt-12"
        heading={guide.relatedModels.length > 1 ? "Phones in this guide" : undefined}
      />

      <JsonLd
        data={articleJsonLd({
          path,
          headline: guide.title,
          description: guide.description,
          author: guide.author,
          publishedAt: guide.publishedAt,
          updatedAt: guide.updatedAt,
          images: [guide.image?.url ?? page.modelValue?.model.imageUrl ?? DEFAULT_OG_IMAGE.url],
          about,
        })}
      />
    </article>
  );
}
