import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  datetime,
  index,
  int,
  mysqlTable,
  text,
  unique,
  varchar,
} from "drizzle-orm/mysql-core";

import { id, timestamps, tradeInGrade, uuidRef } from "./_shared";

/*
 * Trade-in pricing configuration. Everything the pricing engine
 * (src/lib/sell/pricing.ts) uses lives here, so staff can change questions
 * and deductions without a deploy.
 *
 * Offer = price for (variant, grade) from trade_in_prices, where grade is
 * the worst `gradeCap` of the chosen answers (A if none), minus each
 * answer's deduction: `deductionBasisPoints` of that base price plus
 * `deductionPence`. Rounded down to whole pounds, never below zero.
 */

export const quoteQuestions = mysqlTable(
  "quote_questions",
  {
    id: id(),
    /** Stable key stored in quote answers, e.g. "screen". */
    key: varchar({ length: 64 }).notNull().unique("quote_questions_key_unique"),
    /** "device": asked with storage/colour. "condition": one wizard step each. */
    section: varchar({ length: 16 }).notNull(),
    title: text().notNull(),
    help: text(),
    sortOrder: int().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [check("quote_questions_section_check", sql`${t.section} in ('device', 'condition')`)],
);

export const quoteAnswerOptions = mysqlTable(
  "quote_answer_options",
  {
    id: id(),
    questionId: uuidRef()
      .notNull()
      .references(() => quoteQuestions.id, { onDelete: "cascade" }),
    key: varchar({ length: 64 }).notNull(),
    label: text().notNull(),
    description: text(),
    /** Illustration shown with the option, e.g. "screen-cracked". */
    illustration: varchar({ length: 100 }),
    sortOrder: int().notNull().default(0),
    /** Worst grade this answer allows. Null: no effect on grade. */
    gradeCap: tradeInGrade(),
    /** Percentage of the base price to deduct, in basis points (1500 = 15%). */
    deductionBasisPoints: int().notNull().default(0),
    /** Fixed amount to deduct. */
    deductionPence: int().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique("quote_answer_options_question_key_unique").on(t.questionId, t.key),
    index("quote_answer_options_question_idx").on(t.questionId),
    check(
      "quote_answer_options_deduction_check",
      sql`${t.deductionBasisPoints} between 0 and 10000 and ${t.deductionPence} >= 0`,
    ),
  ],
);

/** Fixed-window rate-limit counters (src/lib/security/rate-limit.ts). */
export const rateLimits = mysqlTable("rate_limits", {
  /** e.g. "sell:quote:ip:<hash>". IPs are hashed, never stored raw. */
  key: varchar({ length: 191 }).primaryKey(),
  windowStart: datetime({ mode: "date", fsp: 3 }).notNull(),
  count: int().notNull(),
});
