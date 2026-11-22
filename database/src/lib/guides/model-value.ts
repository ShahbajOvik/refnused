import { TRADE_IN_GRADES, type TradeInGrade } from "../sell/pricing";

/*
 * Live price table for "How much is my [model] worth?" guides. Pure.
 * Figures are the base prices in trade_in_prices: the most we pay before any
 * deductions from the quote questions. They're a guide, not an offer: offers
 * only come from the sell flow (src/lib/sell/pricing.ts).
 */

export type ModelPriceRow = {
  storageGb: number;
  colour: string;
  grade: TradeInGrade;
  pricePence: number;
  updatedAt: Date;
};

export type ModelValueTable = {
  /** Smallest storage first. Each price is the highest across colours. */
  rows: { storageGb: number; prices: Partial<Record<TradeInGrade, number>> }[];
  /** Grades that have at least one price, best first. */
  grades: TradeInGrade[];
  top: { pricePence: number; storageGb: number; grade: TradeInGrade } | null;
  /** Lowest price in working order (grades A–C), for "from" copy. */
  lowestWorkingPence: number | null;
  /** When any price for this model last changed. */
  updatedAt: Date | null;
};

export function buildModelValueTable(prices: ModelPriceRow[]): ModelValueTable {
  const byStorage = new Map<number, Partial<Record<TradeInGrade, number>>>();
  let updatedAt: Date | null = null;
  for (const p of prices) {
    if (!Number.isInteger(p.pricePence) || p.pricePence < 0) {
      throw new RangeError(`Invalid trade-in price: ${p.pricePence}`);
    }
    const row = byStorage.get(p.storageGb) ?? {};
    row[p.grade] = Math.max(row[p.grade] ?? 0, p.pricePence);
    byStorage.set(p.storageGb, row);
    if (!updatedAt || p.updatedAt > updatedAt) updatedAt = p.updatedAt;
  }

  const rows = [...byStorage.entries()]
    .sort(([a], [b]) => a - b)
    .map(([storageGb, gradePrices]) => ({ storageGb, prices: gradePrices }));
  const grades = TRADE_IN_GRADES.filter((g) => rows.some((r) => r.prices[g] !== undefined));

  let top: ModelValueTable["top"] = null;
  let lowestWorkingPence: number | null = null;
  for (const row of rows) {
    for (const grade of grades) {
      const price = row.prices[grade];
      if (price === undefined) continue;
      // Ties go to the smaller storage and better grade (already in that order).
      if (!top || price > top.pricePence)
        top = { pricePence: price, storageGb: row.storageGb, grade };
      if (grade !== "faulty" && price > 0) {
        lowestWorkingPence = Math.min(lowestWorkingPence ?? price, price);
      }
    }
  }
  if (top && top.pricePence === 0) top = null;

  return { rows, grades, top, lowestWorkingPence, updatedAt };
}
