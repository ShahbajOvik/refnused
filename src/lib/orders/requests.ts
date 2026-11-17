/*
 * Returns and warranty rules. Pure, so the windows are easy to test.
 */

/** UK distance-selling cancellation period. */
export const RETURN_WINDOW_DAYS = 14;
const DAY = 86_400_000;

export const RETURN_REASONS = {
  changed_mind: "I changed my mind",
  not_as_described: "It isn’t as described",
  faulty: "It’s faulty",
  wrong_item: "I received the wrong phone",
  other: "Something else",
} as const;

export const WARRANTY_FAULTS = {
  battery: "Battery or charging",
  screen: "Screen or touch",
  camera: "Camera",
  audio: "Speaker, microphone or calls",
  connectivity: "Wi-Fi, Bluetooth or mobile signal",
  buttons: "Buttons or Face ID / fingerprint",
  other: "Something else",
} as const;

export type ReturnReason = keyof typeof RETURN_REASONS;
export type WarrantyFault = keyof typeof WARRANTY_FAULTS;

/**
 * The 14 days start when the customer has the phone: dispatch/collection
 * (fulfilledAt) when we know it, otherwise payment. Ends at the end of the
 * 14th day after that.
 */
export function returnDeadline(order: { placedAt: Date; fulfilledAt: Date | null }): Date {
  const start = order.fulfilledAt ?? order.placedAt;
  return new Date(start.getTime() + RETURN_WINDOW_DAYS * DAY);
}

/** Warranty runs for the unit's warranty months from payment. */
export function warrantyDeadline(placedAt: Date, warrantyMonths: number): Date {
  const end = new Date(placedAt);
  end.setUTCMonth(end.getUTCMonth() + warrantyMonths);
  return end;
}

export type RequestEligibility =
  | { allowed: true; deadline: Date }
  | { allowed: false; reason: "not_paid" | "window_closed"; deadline?: Date };

const ELIGIBLE_ORDER_STATUSES = new Set([
  "paid",
  "processing",
  "dispatched",
  "ready_for_collection",
  "completed",
  "partially_refunded",
]);

export function requestEligibility(
  type: "return" | "warranty",
  order: { status: string; placedAt: Date | null; fulfilledAt: Date | null },
  item: { warrantyMonths: number },
  now: Date,
): RequestEligibility {
  if (!order.placedAt || !ELIGIBLE_ORDER_STATUSES.has(order.status)) {
    return { allowed: false, reason: "not_paid" };
  }
  const deadline =
    type === "return"
      ? returnDeadline({ placedAt: order.placedAt, fulfilledAt: order.fulfilledAt })
      : warrantyDeadline(order.placedAt, item.warrantyMonths);
  return now <= deadline
    ? { allowed: true, deadline }
    : { allowed: false, reason: "window_closed", deadline };
}
