/**
 * Delivery, collection and returns terms for the shop. Single source for
 * product pages and Product JSON-LD.
 *
 * SAMPLE values: confirm prices, carriers, cut-off times and the returns
 * window before launch. (UK distance-selling law requires at least 14 days.)
 */

export type DeliveryOption = {
  key: string;
  label: string;
  /** Integer pence. */
  pricePence: number;
  description: string;
  /** Working days before dispatch. */
  handlingDays: { min: number; max: number };
  /** Working days in transit. */
  transitDays: { min: number; max: number };
};

export const DELIVERY_OPTIONS: DeliveryOption[] = [
  {
    key: "tracked-48",
    label: "Free tracked delivery",
    pricePence: 0,
    description: "Royal Mail Tracked 48. Arrives in 2–3 working days.",
    handlingDays: { min: 0, max: 1 },
    transitDays: { min: 2, max: 3 },
  },
  {
    key: "next-day",
    label: "Next working day",
    pricePence: 599,
    description: "Order by 2pm, Monday to Friday. Signed for.",
    handlingDays: { min: 0, max: 0 },
    transitDays: { min: 1, max: 1 },
  },
];

export const CLICK_AND_COLLECT = {
  pricePence: 0,
  description: "Free. We’ll text you when it’s ready, usually within 2 hours of opening time.",
  /** How long we hold a phone for collection. */
  holdDays: 5,
};

export const RETURN_POLICY = {
  days: 30,
  freeReturns: true,
  byMail: true,
  inStore: true,
};
