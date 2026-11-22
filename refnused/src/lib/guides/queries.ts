import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/db";
import { cachedPublicQuestions } from "@/lib/sell/queries";

import { getModelLinkTargets, getModelValueData, listTradeInModels } from "./catalogue";
import {
  articleGuide,
  fixedGuide,
  guideSummaries,
  isArticleSlug,
  modelValueGuide,
} from "./compose";
import { buildModelValueTable, type ModelValueTable } from "./model-value";
import { fetchSanityGuide, fetchSanityGuides } from "./sanity.server";
import { FIXED_GUIDE_SLUGS, parseModelValueSlug } from "./slugs";
import type { Guide, GuideSummary } from "./types";

/*
 * Cached guide reads. Tags: "guides" (revalidated by the Sanity webhook),
 * "catalogue" and "trade-in-prices" (revalidated by the admin), so a price
 * change shows in its guide straight away.
 */

export async function cachedGuideSummaries(): Promise<GuideSummary[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("guides", "catalogue", "trade-in-prices");
  const [sanityGuides, models] = await Promise.all([fetchSanityGuides(), listTradeInModels(db)]);
  return guideSummaries({ sanityGuides, models });
}

/** Every model we buy, with its top price and when prices last changed (models sitemap). */
export async function cachedSellableModels() {
  "use cache";
  cacheLife("hours");
  cacheTag("catalogue", "trade-in-prices");
  return listTradeInModels(db);
}

export type ModelValueContent = {
  model: NonNullable<Awaited<ReturnType<typeof getModelValueData>>>["model"];
  table: ModelValueTable;
};

export type GuidePage =
  | { guide: Guide & { template: "model-value" }; modelValue: ModelValueContent }
  | { guide: Guide & { template: "wipe" | "grading" | "article" }; modelValue: null };

export async function cachedGuide(slug: string): Promise<GuidePage | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("guides", "catalogue", "trade-in-prices");

  const modelSlug = parseModelValueSlug(slug);
  if (modelSlug) {
    const [data, doc] = await Promise.all([
      getModelValueData(db, modelSlug),
      fetchSanityGuide({ by: "model", value: modelSlug }),
    ]);
    if (!data) return null;
    const table = buildModelValueTable(data.prices);
    const guide = modelValueGuide(
      data.model,
      { maxPricePence: table.top?.pricePence ?? null, updatedAt: table.updatedAt },
      doc,
    );
    return {
      guide: { ...guide, template: "model-value" },
      modelValue: { model: data.model, table },
    };
  }

  for (const template of ["wipe", "grading"] as const) {
    if (slug === FIXED_GUIDE_SLUGS[template]) {
      const doc = await fetchSanityGuide({ by: "template", value: template });
      return { guide: { ...fixedGuide(template, doc), template }, modelValue: null };
    }
  }

  if (!isArticleSlug(slug)) return null;
  const doc = await fetchSanityGuide({ by: "slug", value: slug });
  const guide = doc ? articleGuide(doc) : null;
  return guide ? { guide: { ...guide, template: "article" }, modelValue: null } : null;
}

/** Sell, shop and guide links for each model (see components/seo/model-links.tsx). */
export async function cachedModelLinkTargets(modelSlugs: string[]) {
  "use cache";
  cacheLife("minutes");
  cacheTag("products", "catalogue", "trade-in-prices");
  return getModelLinkTargets(db, modelSlugs);
}

/** Question titles for "what affects the price" (no deductions leave the server). */
export async function cachedQuoteQuestionTitles(): Promise<string[]> {
  const questions = await cachedPublicQuestions();
  return questions.map((q) => q.title);
}
