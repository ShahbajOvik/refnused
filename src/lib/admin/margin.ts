/*
 * Margin on a phone we buy and resell. Pure, integer pence.
 *
 * VAT: second-hand phones are usually sold under the VAT margin scheme,
 * where VAT is 1/6 of the profit margin (sell − buy), not of the price.
 * SAMPLE defaults: confirm the card fee and scheme with the accountant.
 */

export const DEFAULT_CARD_FEE = { basisPoints: 150, fixedPence: 20 };

export type MarginInput = {
  buyPence: number;
  refurbPence: number;
  sellPence: number;
  /** Apply VAT margin scheme (1/6 of sell − buy). */
  marginScheme: boolean;
  cardFee?: { basisPoints: number; fixedPence: number };
};

export type MarginResult = {
  feesPence: number;
  vatPence: number;
  profitPence: number;
  /** Profit as a percentage of the sale price, 1 decimal place. */
  marginPercent: number;
};

export function calculateMargin(input: MarginInput): MarginResult {
  for (const key of ["buyPence", "refurbPence", "sellPence"] as const) {
    const v = input[key];
    if (!Number.isInteger(v) || v < 0)
      throw new RangeError(`${key} must be a non-negative integer`);
  }
  const fee = input.cardFee ?? DEFAULT_CARD_FEE;
  const feesPence =
    input.sellPence === 0
      ? 0
      : Math.round((input.sellPence * fee.basisPoints) / 10_000) + fee.fixedPence;
  const vatPence = input.marginScheme
    ? Math.max(0, Math.round((input.sellPence - input.buyPence) / 6))
    : 0;
  const profitPence = input.sellPence - input.buyPence - input.refurbPence - feesPence - vatPence;
  const marginPercent =
    input.sellPence === 0 ? 0 : Math.round((profitPence / input.sellPence) * 1000) / 10;
  return { feesPence, vatPence, profitPence, marginPercent };
}
