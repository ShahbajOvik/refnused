/*
 * Order totals, in integer pence. Pure: the server feeds it database
 * prices only, and it's the single place totals are worked out.
 */

/**
 * Stripe's smallest GBP charge. A trade-in can't take the card payment
 * below this; any trade-in value left over is paid to the customer's bank
 * as usual.
 */
export const MIN_CARD_CHARGE_PENCE = 30;

export type OrderTotals = {
  subtotalPence: number;
  deliveryPence: number;
  /** Trade-in value taken off this order. */
  tradeInCreditPence: number;
  /** Trade-in value that didn't fit, paid to the customer separately. */
  tradeInRemainderPence: number;
  /** What the customer pays now. */
  totalPence: number;
};

export class OrderTotalsError extends Error {
  override name = "OrderTotalsError";
}

function assertPence(name: string, value: number) {
  if (!Number.isInteger(value) || value < 0) {
    throw new OrderTotalsError(`${name} must be a non-negative integer, received ${value}`);
  }
}

export function calculateOrderTotals(input: {
  itemPricesPence: number[];
  deliveryPence: number;
  tradeInValuePence?: number;
}): OrderTotals {
  if (input.itemPricesPence.length === 0) throw new OrderTotalsError("The basket is empty");
  input.itemPricesPence.forEach((p, i) => assertPence(`itemPricesPence[${i}]`, p));
  assertPence("deliveryPence", input.deliveryPence);
  const tradeIn = input.tradeInValuePence ?? 0;
  assertPence("tradeInValuePence", tradeIn);

  const subtotalPence = input.itemPricesPence.reduce((sum, p) => sum + p, 0);
  const gross = subtotalPence + input.deliveryPence;
  const tradeInCreditPence = Math.min(tradeIn, Math.max(0, gross - MIN_CARD_CHARGE_PENCE));
  return {
    subtotalPence,
    deliveryPence: input.deliveryPence,
    tradeInCreditPence,
    tradeInRemainderPence: tradeIn - tradeInCreditPence,
    totalPence: gross - tradeInCreditPence,
  };
}
