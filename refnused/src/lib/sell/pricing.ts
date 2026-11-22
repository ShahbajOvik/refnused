/**
 * Trade-in pricing engine. Pure: no database or framework imports, so it is
 * fully unit-tested. All inputs (questions, deductions, base prices) come
 * from the database via src/lib/sell/offer-service.ts.
 *
 *   grade   = worst gradeCap among the chosen answers (A if none)
 *   base    = trade_in_prices[variant][grade]
 *   each deduction = round(base × basisPoints / 10 000) + pence
 *   offer   = base − deductions, rounded DOWN to whole pounds, never < 0
 *
 * Percentage deductions are always taken from the base price, not
 * compounded, so the order of questions never changes the price.
 */

export const TRADE_IN_GRADES = ["A", "B", "C", "faulty"] as const;
export type TradeInGrade = (typeof TRADE_IN_GRADES)[number];

/** Lowest offer we accept online, in pence. Below this, bring it to a store. */
export const MIN_ONLINE_OFFER_PENCE = 100;

export type PricingOption = {
  key: string;
  label: string;
  gradeCap: TradeInGrade | null;
  deductionBasisPoints: number;
  deductionPence: number;
};

export type PricingQuestion = {
  key: string;
  title: string;
  options: PricingOption[];
};

export type BasePrices = Partial<Record<TradeInGrade, number>>;
export type Answers = Record<string, string>;

export type OfferDeduction = {
  questionKey: string;
  optionKey: string;
  label: string;
  amountPence: number;
};

export type OfferResult = {
  grade: TradeInGrade;
  basePricePence: number;
  deductions: OfferDeduction[];
  offerPence: number;
  /** False when the offer is too low to accept online. */
  acceptableOnline: boolean;
};

export type PricingErrorCode =
  "missing_answer" | "unknown_question" | "unknown_option" | "no_price";

export class PricingError extends Error {
  override name = "PricingError";
  constructor(
    readonly code: PricingErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** The worse of two grades (A best, faulty worst). */
export function worseGrade(a: TradeInGrade, b: TradeInGrade): TradeInGrade {
  return TRADE_IN_GRADES.indexOf(a) >= TRADE_IN_GRADES.indexOf(b) ? a : b;
}

function assertWholePence(value: number, what: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${what} must be a non-negative integer number of pence`);
  }
}

export function calculateOffer(input: {
  questions: PricingQuestion[];
  basePrices: BasePrices;
  answers: Answers;
}): OfferResult {
  const { questions, basePrices, answers } = input;
  const byKey = new Map(questions.map((q) => [q.key, q]));

  for (const key of Object.keys(answers)) {
    if (!byKey.has(key)) throw new PricingError("unknown_question", `Unknown question "${key}"`);
  }

  const chosen = questions.map((question) => {
    const optionKey = answers[question.key];
    if (optionKey === undefined) {
      throw new PricingError("missing_answer", `No answer for "${question.key}"`);
    }
    const option = question.options.find((o) => o.key === optionKey);
    if (!option) {
      throw new PricingError(
        "unknown_option",
        `Unknown answer "${optionKey}" for "${question.key}"`,
      );
    }
    return { question, option };
  });

  const grade = chosen.reduce<TradeInGrade>(
    (worst, { option }) => (option.gradeCap ? worseGrade(worst, option.gradeCap) : worst),
    "A",
  );

  const basePricePence = basePrices[grade];
  if (basePricePence === undefined) {
    throw new PricingError("no_price", `No trade-in price set for grade ${grade}`);
  }
  assertWholePence(basePricePence, "Base price");

  const deductions: OfferDeduction[] = [];
  for (const { question, option } of chosen) {
    assertWholePence(option.deductionPence, "Deduction");
    if (
      !Number.isInteger(option.deductionBasisPoints) ||
      option.deductionBasisPoints < 0 ||
      option.deductionBasisPoints > 10_000
    ) {
      throw new RangeError("deductionBasisPoints must be an integer between 0 and 10000");
    }
    const amountPence =
      Math.round((basePricePence * option.deductionBasisPoints) / 10_000) + option.deductionPence;
    if (amountPence > 0) {
      deductions.push({
        questionKey: question.key,
        optionKey: option.key,
        label: `${question.title}: ${option.label}`,
        amountPence,
      });
    }
  }

  const total = deductions.reduce((sum, d) => sum + d.amountPence, 0);
  const offerPence = Math.max(0, Math.floor((basePricePence - total) / 100) * 100);

  return {
    grade,
    basePricePence,
    deductions,
    offerPence,
    acceptableOnline: offerPence >= MIN_ONLINE_OFFER_PENCE,
  };
}
