/*
 * Customer-facing explanations for a unit's battery and the trade-in
 * calculator. Pure and safe to import in the browser.
 */

export type BatteryRating = {
  label: string;
  description: string;
  /** For styling only. */
  level: "excellent" | "good" | "fair" | "low";
};

/** Battery health is the battery's maximum capacity compared with when new. */
export function batteryRating(percent: number): BatteryRating {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new RangeError(`Battery health must be 0–100, received ${percent}`);
  }
  if (percent >= 95)
    return {
      label: "Like new",
      description: "Practically the same battery life as a new phone.",
      level: "excellent",
    };
  if (percent >= 90)
    return {
      label: "Excellent",
      description: "A full day of typical use, close to new.",
      level: "excellent",
    };
  if (percent >= 85)
    return {
      label: "Very good",
      description: "A little less than new. Most people won’t notice.",
      level: "good",
    };
  if (percent >= 80)
    return {
      label: "Good",
      description: "Noticeably less than new. Heavy users may want to charge during the day.",
      level: "fair",
    };
  return {
    label: "Reduced",
    description: "Shorter battery life than new. Expect to charge more often.",
    level: "low",
  };
}

/** Conditions in the trade-in-and-save estimate, mapped to trade-in grades. */
export const TRADE_IN_CONDITIONS = [
  {
    key: "like-new",
    grade: "A",
    label: "Like new",
    description: "No marks, everything works",
  },
  {
    key: "good",
    grade: "B",
    label: "Good",
    description: "Light scratches, everything works",
  },
  {
    key: "worn",
    grade: "C",
    label: "Well used",
    description: "Heavy scratches or dents, everything works",
  },
  {
    key: "faulty",
    grade: "faulty",
    label: "Cracked or faulty",
    description: "Cracked glass, or something doesn’t work",
  },
] as const;

export type TradeInConditionKey = (typeof TRADE_IN_CONDITIONS)[number]["key"];
export const TRADE_IN_CONDITION_KEYS = TRADE_IN_CONDITIONS.map((c) => c.key) as [
  TradeInConditionKey,
  ...TradeInConditionKey[],
];

export type TradeInSaving = {
  tradeInPence: number;
  /** What's left to pay for the phone after the trade-in (never below zero). */
  payPence: number;
  /** Trade-in value above the phone's price, paid to the customer. */
  cashBackPence: number;
};

/** Phone price minus a trade-in, in integer pence. */
export function tradeInSaving(productPricePence: number, tradeInPence: number): TradeInSaving {
  for (const [name, value] of [
    ["productPricePence", productPricePence],
    ["tradeInPence", tradeInPence],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative integer, received ${value}`);
    }
  }
  return {
    tradeInPence,
    payPence: Math.max(0, productPricePence - tradeInPence),
    cashBackPence: Math.max(0, tradeInPence - productPricePence),
  };
}
