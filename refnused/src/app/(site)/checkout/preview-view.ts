import type { CheckoutPreview, TradeInCheck } from "@/lib/orders/checkout-service";
import type { OrderTotals } from "@/lib/orders/totals";

/** What the browser may see of a preview (no internal ids beyond product ids). */
export type PreviewView = {
  lines: { productId: string; description: string; pricePence: number; available: boolean }[];
  totals: OrderTotals;
  deliveryLabel: string;
  collection?: { storeName: string; storeTown: string; sameDay: boolean };
  tradeIn?: { ok: true; reference: string; device: string } | { ok: false; message: string };
};

export const TRADE_IN_MESSAGES: Record<Extract<TradeInCheck, { ok: false }>["reason"], string> = {
  not_found:
    "We couldn’t find that quote for this email. Use the email you gave when you got the quote.",
  not_eligible: "That trade-in can’t be used as credit. Contact us if you think that’s wrong.",
  expired: "That quote’s price lock has ended. Get a new quote and use that reference.",
  in_use: "That trade-in is already being used for another order.",
};

export function toPreviewView(preview: CheckoutPreview): PreviewView {
  return {
    lines: preview.lines.map((l) => ({
      productId: l.productId,
      description: l.description,
      pricePence: l.pricePence,
      available: l.available,
    })),
    totals: preview.totals,
    deliveryLabel: preview.deliveryLabel,
    collection: preview.collection && {
      storeName: preview.collection.storeName,
      storeTown: preview.collection.storeTown,
      sameDay: preview.collection.sameDay,
    },
    tradeIn: preview.tradeIn
      ? preview.tradeIn.ok
        ? { ok: true, reference: preview.tradeIn.reference, device: preview.tradeIn.device }
        : { ok: false, message: TRADE_IN_MESSAGES[preview.tradeIn.reason] }
      : undefined,
  };
}
