import type { OrderView } from "@/lib/orders/order-service";

import type { TimelineStep } from "./quotes";

/** Delivery or collection progress for an order. Pure. */
export function orderTimeline(order: OrderView): TimelineStep[] {
  if (order.status === "pending_payment") {
    return [{ key: "payment", label: "Waiting for payment", state: "current" }];
  }
  const placed: TimelineStep = {
    key: "placed",
    label: "Order placed",
    state: order.placedAt ? "done" : "failed",
    date: order.placedAt,
  };
  if (order.status === "cancelled") {
    return [placed, { key: "cancelled", label: "Cancelled", state: "failed" }];
  }
  const refunded = order.status === "refunded" || order.status === "partially_refunded";
  const finished = order.status === "completed" || Boolean(order.completedAt);

  if (order.fulfilmentMethod === "click_and_collect") {
    const ready = Boolean(order.readyForCollectionAt) || Boolean(order.fulfilledAt);
    const collected = Boolean(order.fulfilledAt) || finished;
    return [
      placed,
      {
        key: "ready",
        label: "Ready to collect",
        state: ready ? "done" : "current",
        date: order.readyForCollectionAt,
        detail:
          order.collectionStore && !collected
            ? `${order.collectionStore.name}, ${order.collectionStore.street}, ${order.collectionStore.town}. Bring photo ID.`
            : undefined,
      },
      {
        key: "collected",
        label: "Collected",
        state: collected ? "done" : ready ? "current" : "upcoming",
        date: order.fulfilledAt,
      },
      ...(refunded
        ? [
            {
              key: "refunded",
              label: order.status === "refunded" ? "Refunded" : "Partly refunded",
              state: "done" as const,
            },
          ]
        : []),
    ];
  }

  const dispatched = Boolean(order.fulfilledAt);
  return [
    placed,
    {
      key: "dispatched",
      label: "Dispatched",
      state: dispatched ? "done" : "current",
      date: order.fulfilledAt,
      detail: order.tracking
        ? `${order.tracking.carrier} tracking ${order.tracking.number}`
        : undefined,
    },
    {
      key: "delivered",
      label: "Delivered",
      state: finished ? "done" : dispatched ? "current" : "upcoming",
      date: order.completedAt,
    },
    ...(refunded
      ? [
          {
            key: "refunded",
            label: order.status === "refunded" ? "Refunded" : "Partly refunded",
            state: "done" as const,
          },
        ]
      : []),
  ];
}
