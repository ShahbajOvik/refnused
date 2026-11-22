import { and, asc, eq } from "drizzle-orm";

import { quoteAnswerOptions, quoteQuestions, tradeInPrices } from "../../db/schema";
import type { AppDb } from "../../db/types";

import {
  calculateOffer,
  type Answers,
  type BasePrices,
  type PricingOption,
  type PricingQuestion,
} from "./pricing";

/** Price lock for every accepted quote. */
export const PRICE_LOCK_DAYS = 14;

export type QuestionConfig = Omit<PricingQuestion, "options"> & {
  section: "device" | "condition";
  help: string | null;
  options: (PricingOption & {
    description: string | null;
    illustration: string | null;
  })[];
};

/** Active questions and options, in display order. */
export async function loadQuestionConfig(db: AppDb): Promise<QuestionConfig[]> {
  const rows = await db
    .select({ question: quoteQuestions, option: quoteAnswerOptions })
    .from(quoteQuestions)
    .innerJoin(quoteAnswerOptions, eq(quoteAnswerOptions.questionId, quoteQuestions.id))
    .where(and(eq(quoteQuestions.isActive, true), eq(quoteAnswerOptions.isActive, true)))
    .orderBy(asc(quoteQuestions.sortOrder), asc(quoteAnswerOptions.sortOrder));

  const questions = new Map<string, QuestionConfig>();
  for (const { question, option } of rows) {
    let q = questions.get(question.key);
    if (!q) {
      q = {
        key: question.key,
        section: question.section as QuestionConfig["section"],
        title: question.title,
        help: question.help,
        options: [],
      };
      questions.set(question.key, q);
    }
    q.options.push({
      key: option.key,
      label: option.label,
      description: option.description,
      illustration: option.illustration,
      gradeCap: option.gradeCap,
      deductionBasisPoints: option.deductionBasisPoints,
      deductionPence: option.deductionPence,
    });
  }
  return [...questions.values()];
}

/** The same questions without any pricing data, safe to send to the browser. */
export function publicQuestions(questions: QuestionConfig[]) {
  return questions.map((q) => ({
    key: q.key,
    section: q.section,
    title: q.title,
    help: q.help,
    options: q.options.map((o) => ({
      key: o.key,
      label: o.label,
      description: o.description,
      illustration: o.illustration,
    })),
  }));
}
export type PublicQuestion = ReturnType<typeof publicQuestions>[number];

export async function loadBasePrices(db: AppDb, variantId: string): Promise<BasePrices> {
  const rows = await db
    .select({ grade: tradeInPrices.grade, pricePence: tradeInPrices.pricePence })
    .from(tradeInPrices)
    .where(eq(tradeInPrices.variantId, variantId));
  return Object.fromEntries(rows.map((r) => [r.grade, r.pricePence]));
}

/** Calculates an offer entirely from database data. Never trust client prices. */
export async function computeOffer(db: AppDb, input: { variantId: string; answers: Answers }) {
  const [questions, basePrices] = await Promise.all([
    loadQuestionConfig(db),
    loadBasePrices(db, input.variantId),
  ]);
  return calculateOffer({ questions, basePrices, answers: input.answers });
}
