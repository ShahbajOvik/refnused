import type { PreviewView } from "@/app/(site)/checkout/actions";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The full price, as worked out by the server, shown before payment. */
export function OrderSummary({
  preview,
  updating = false,
  error,
}: {
  preview: PreviewView;
  updating?: boolean;
  error?: string | null;
}) {
  const { totals } = preview;
  return (
    <aside
      aria-labelledby="order-summary-heading"
      aria-busy={updating || undefined}
      className="h-fit rounded-2xl border p-6 lg:sticky lg:top-24"
    >
      <h2 id="order-summary-heading" className="text-lg font-semibold">
        Order summary
      </h2>
      <ul className="mt-4 flex flex-col gap-3 text-sm">
        {preview.lines.map((line) => (
          <li key={line.productId} className="flex justify-between gap-4">
            <span>
              {line.description}
              {line.available ? null : (
                <span className="block font-medium text-destructive">No longer available</span>
              )}
            </span>
            <span className="shrink-0">{formatPrice(line.pricePence)}</span>
          </li>
        ))}
      </ul>
      <dl
        className={cn(
          "mt-4 flex flex-col gap-2 border-t pt-4 text-sm transition-opacity",
          updating && "opacity-60",
        )}
      >
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd data-testid="summary-subtotal">{formatPrice(totals.subtotalPence)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>{preview.deliveryLabel}</dt>
          <dd data-testid="summary-delivery">
            {totals.deliveryPence ? formatPrice(totals.deliveryPence) : "Free"}
          </dd>
        </div>
        {totals.tradeInCreditPence ? (
          <div className="flex justify-between">
            <dt>Trade-in credit</dt>
            <dd data-testid="summary-trade-in">−{formatPrice(totals.tradeInCreditPence)}</dd>
          </div>
        ) : null}
        <div className="mt-2 flex justify-between border-t pt-3 text-base font-semibold">
          <dt>Total to pay</dt>
          <dd data-testid="summary-total">{formatPrice(totals.totalPence)}</dd>
        </div>
      </dl>
      {totals.tradeInRemainderPence ? (
        <p className="mt-3 text-sm text-muted-foreground">
          The other {formatPrice(totals.tradeInRemainderPence)} of your trade-in is paid to your
          bank account once we’ve checked your phone.
        </p>
      ) : null}
      {totals.tradeInCreditPence ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Trade-in credit is based on your quote. If your phone isn’t as described when it arrives,
          we’ll contact you before changing anything.
        </p>
      ) : null}
      <p role="status" className="sr-only">
        {updating ? "Updating total" : `Total to pay ${formatPrice(totals.totalPence)}`}
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </aside>
  );
}
