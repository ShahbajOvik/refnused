import { siteConfig } from "@refnused/database/config/site";
import { formatPrice } from "@refnused/database/lib/format";
import { metaDescription } from "@/lib/metadata";

import {
  FIXED_GUIDE_SLUGS,
  isGuideSlug,
  modelValueSlug,
  parseModelValueSlug,
  type GuideTemplate,
} from "@refnused/database/lib/guides/slugs";
import type { Guide, GuideAuthor, GuideBlocks, GuideSummary, SanityGuide } from "@refnused/database/lib/guides/types";

/*
 * Builds guides from their two sources. Pure.
 *
 * - Built-in templates always exist: one "How much is my … worth?" guide per
 *   model we buy, plus "How to wipe a phone" and "Grading explained". Their
 *   live parts (prices, grades) are rendered from the database and code.
 * - Sanity adds editorial copy: an article of its own, or a document with
 *   template "wipe", "grading" or "model-value" (+ model) that replaces the
 *   built-in title, description, author and dates and adds a body.
 */

export const TEAM_AUTHOR: GuideAuthor = { kind: "organization", name: siteConfig.name };

type FixedTemplate = keyof typeof FIXED_GUIDE_SLUGS;

/** Built-in copy. Update `updatedAt` when you change a built-in guide's content. */
export const BUILTIN_GUIDES: Record<
  FixedTemplate,
  Pick<Guide, "title" | "description" | "publishedAt" | "updatedAt">
> = {
  wipe: {
    title: "How to wipe a phone before you sell it",
    description:
      "Back up, sign out of iCloud or Google, remove your SIM and factory reset. Step-by-step for iPhone, Samsung and Google Pixel.",
    publishedAt: "2026-11-19T09:00:00.000Z",
    updatedAt: "2026-11-19T09:00:00.000Z",
  },
  grading: {
    title: "Phone grading explained: what Grade A, B and C mean",
    description:
      "What each condition grade means for a refurbished phone’s screen and body, how we grade trade-ins, and how battery health is rated.",
    publishedAt: "2026-11-19T09:00:00.000Z",
    updatedAt: "2026-11-19T09:00:00.000Z",
  },
};

function authorOf(g: SanityGuide | null): GuideAuthor {
  return g?.author
    ? { kind: "person", name: g.author.name, role: g.author.role ?? null }
    : TEAM_AUTHOR;
}

function imageOf(g: SanityGuide | null): Guide["image"] {
  if (!g?.image) return null;
  return {
    url: g.image.url,
    alt: g.image.alt ?? "",
    width: g.image.width ?? null,
    height: g.image.height ?? null,
  };
}

function bodyOf(g: SanityGuide | null): GuideBlocks | null {
  return g?.body?.length ? g.body : null;
}

function toIso(value: string): string {
  return new Date(value).toISOString();
}

function latest(...dates: (string | null | undefined)[]): string {
  const times = dates.filter((d): d is string => !!d).map((d) => new Date(d).getTime());
  return new Date(Math.max(...times)).toISOString();
}

export function fixedGuide(template: FixedTemplate, doc: SanityGuide | null): Guide {
  const builtin = BUILTIN_GUIDES[template];
  return {
    slug: FIXED_GUIDE_SLUGS[template],
    template,
    title: doc?.title ?? builtin.title,
    description: metaDescription(doc?.description ?? builtin.description),
    author: authorOf(doc),
    publishedAt: doc?.publishedAt ? toIso(doc.publishedAt) : builtin.publishedAt,
    // The page also shows live content from code, so never older than the built-in copy.
    updatedAt: latest(builtin.updatedAt, doc?.updatedAt),
    image: imageOf(doc),
    body: bodyOf(doc),
    relatedModels: doc?.relatedModels ?? [],
    model: null,
  };
}

export type ModelValueSource = {
  slug: string;
  name: string;
  brandName: string;
  createdAt: Date;
};

export function modelValueTitle(m: Pick<ModelValueSource, "name" | "brandName">): string {
  return `How much is my ${m.brandName} ${m.name} worth?`;
}

export function modelValueDescription(
  m: Pick<ModelValueSource, "name" | "brandName">,
  maxPricePence: number | null,
): string {
  const upTo = maxPricePence ? ` We pay up to ${formatPrice(maxPricePence, { whole: true })}.` : "";
  return `Today’s trade-in prices for the ${m.brandName} ${m.name} by storage and condition.${upTo} Free postage or drop off in North Shields or South Shields.`;
}

export function modelValueGuide(
  model: ModelValueSource,
  prices: { maxPricePence: number | null; updatedAt: Date | null },
  doc: SanityGuide | null,
): Guide {
  const created = model.createdAt.toISOString();
  return {
    slug: modelValueSlug(model.slug),
    template: "model-value",
    // The title carries the model name for search, so editors can't replace it.
    title: modelValueTitle(model),
    description: metaDescription(
      doc?.description ?? modelValueDescription(model, prices.maxPricePence),
    ),
    author: authorOf(doc),
    publishedAt: doc?.publishedAt ? toIso(doc.publishedAt) : created,
    // Prices are live, so the guide changes whenever a price does.
    updatedAt: latest(created, prices.updatedAt?.toISOString(), doc?.updatedAt),
    image: imageOf(doc),
    body: bodyOf(doc),
    relatedModels: [model.slug, ...(doc?.relatedModels ?? []).filter((s) => s !== model.slug)],
    model: model.slug,
  };
}

/** A Sanity article, unless its slug is reserved for a built-in guide. */
export function articleGuide(doc: SanityGuide): Guide | null {
  if (doc.template !== "article" || !doc.slug || !isArticleSlug(doc.slug)) return null;
  return {
    slug: doc.slug,
    template: "article",
    title: doc.title,
    description: metaDescription(doc.description ?? doc.title),
    author: authorOf(doc),
    publishedAt: toIso(doc.publishedAt ?? doc.createdAt),
    updatedAt: latest(doc.updatedAt, doc.publishedAt),
    image: imageOf(doc),
    body: bodyOf(doc),
    relatedModels: doc.relatedModels ?? [],
    model: null,
  };
}

export function isArticleSlug(slug: string): boolean {
  return (
    isGuideSlug(slug) &&
    parseModelValueSlug(slug) === null &&
    !Object.values(FIXED_GUIDE_SLUGS).includes(slug as never)
  );
}

export type ModelSummarySource = ModelValueSource & {
  maxPricePence: number | null;
  pricesUpdatedAt: Date | null;
};

/**
 * Every guide for /guides and the sitemap: the fixed guides, one per model we
 * buy, then Sanity articles (newest first).
 */
export function guideSummaries(input: {
  sanityGuides: SanityGuide[];
  models: ModelSummarySource[];
}): GuideSummary[] {
  const docFor = (template: GuideTemplate, model?: string) =>
    input.sanityGuides.find((g) => g.template === template && (!model || g.model === model)) ??
    null;
  const summary = (g: Guide): GuideSummary => ({
    slug: g.slug,
    template: g.template,
    title: g.title,
    description: g.description,
    updatedAt: g.updatedAt,
    model: g.model,
    relatedModels: g.relatedModels,
  });

  const fixed = (["wipe", "grading"] as const).map((t) => summary(fixedGuide(t, docFor(t))));
  const models = input.models.map((m) =>
    summary(
      modelValueGuide(
        m,
        { maxPricePence: m.maxPricePence, updatedAt: m.pricesUpdatedAt },
        docFor("model-value", m.slug),
      ),
    ),
  );
  const seen = new Set<string>();
  const articles = input.sanityGuides.flatMap((doc) => {
    const g = articleGuide(doc);
    if (!g || seen.has(g.slug)) return [];
    seen.add(g.slug);
    return [summary(g)];
  });
  return [...fixed, ...models, ...articles];
}
