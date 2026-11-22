"use client";

import { LockIcon } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { cloneElement, useEffect, useId, useRef, useState, useTransition } from "react";

import {
  previewCheckoutAction,
  startCheckoutAction,
  type PreviewView,
  type StartCheckoutActionResult,
} from "@/app/(site)/checkout/actions";
import { TurnstileWidget } from "@/components/sell/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DeliveryOption } from "@/config/shop";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

import { OrderSummary } from "./order-summary";

// Stripe.js only loads once the order exists and it's time to pay.
const PaymentPanel = dynamic(() => import("./payment-panel"), {
  ssr: false,
  loading: () => <p role="status">Loading secure payment form…</p>,
});

export type SavedAddressOption = {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  town: string;
  county: string | null;
  postcode: string;
  isDefault: boolean;
};

export type CheckoutStore = {
  slug: string;
  name: string;
  street: string;
  town: string;
  postcode: string;
};

type Fulfilment =
  | { method: "delivery"; deliveryOption: string }
  | { method: "click_and_collect"; storeSlug: string };

type PaymentState = Extract<StartCheckoutActionResult, { ok: true }> & {
  billing: {
    name: string;
    email: string;
    phone: string;
    postcode?: string;
    line1?: string;
    town?: string;
  };
};

const fieldId = (path: string) => `co-${path.replace(/\./g, "-")}`;

export function CheckoutForm({
  initialPreview,
  stores,
  deliveryOptions,
  turnstileSiteKey,
  stripePublishableKey,
  prefill,
  savedAddresses = [],
}: {
  initialPreview: PreviewView;
  stores: CheckoutStore[];
  deliveryOptions: DeliveryOption[];
  turnstileSiteKey?: string;
  stripePublishableKey?: string;
  /** Signed-in customers: their details. */
  prefill?: { email: string; name: string | null; phone: string | null };
  /** Signed-in customers: saved addresses (default first). */
  savedAddresses?: SavedAddressOption[];
}) {
  const defaultAddress = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0];

  /** Fills the address fields from a saved address. */
  function fillSavedAddress(addressId: string) {
    const address = savedAddresses.find((a) => a.id === addressId);
    const form = formRef.current;
    if (!address || !form) return;
    for (const field of ["line1", "line2", "town", "county", "postcode"] as const) {
      const input = form.elements.namedItem(field) as HTMLInputElement | null;
      if (input) input.value = address[field] ?? "";
    }
  }
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const paymentHeading = useRef<HTMLHeadingElement>(null);

  const [preview, setPreview] = useState(initialPreview);
  const [fulfilment, setFulfilment] = useState<Fulfilment>({
    method: "delivery",
    deliveryOption: deliveryOptions[0]!.key,
  });
  const [tradeInRef, setTradeInRef] = useState("");
  const [appliedTradeIn, setAppliedTradeIn] = useState<string | undefined>();
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [pending, startTransition] = useTransition();
  const [pricing, startPricing] = useTransition();

  // Move focus to the payment step once it has rendered.
  const paymentOrder = payment?.orderNumber;
  useEffect(() => {
    if (paymentOrder) paymentHeading.current?.focus();
  }, [paymentOrder]);

  const fe = (path: string) => fieldErrors[path]?.[0];
  const emailValue = () =>
    (formRef.current?.elements.namedItem("email") as HTMLInputElement | null)?.value ?? "";

  /** Asks the server for the full price after any change that affects it. */
  function reprice(next: { fulfilment?: Fulfilment; tradeIn?: string | null }) {
    const f = next.fulfilment ?? fulfilment;
    const t = next.tradeIn === null ? undefined : (next.tradeIn ?? appliedTradeIn);
    startPricing(async () => {
      const result = await previewCheckoutAction({
        email: emailValue() || undefined,
        fulfilment: f,
        tradeInReference: t || undefined,
      });
      if (result.ok) {
        setPreview(result.preview);
        setPreviewError(null);
      } else {
        setPreviewError(result.error);
      }
    });
  }

  function chooseFulfilment(next: Fulfilment) {
    setFulfilment(next);
    reprice({ fulfilment: next });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "");
    const payload = {
      email: text("email"),
      name: text("name"),
      phone: text("phone"),
      fulfilment:
        fulfilment.method === "delivery"
          ? {
              method: "delivery",
              deliveryOption: fulfilment.deliveryOption,
              address: {
                line1: text("line1"),
                line2: text("line2"),
                town: text("town"),
                county: text("county"),
                postcode: text("postcode"),
              },
            }
          : { method: "click_and_collect", storeSlug: fulfilment.storeSlug },
      tradeInReference: appliedTradeIn || undefined,
    };
    startTransition(async () => {
      const result = await startCheckoutAction(payload, turnstileToken);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        requestAnimationFrame(() => summaryRef.current?.focus());
        return;
      }
      setError(null);
      setFieldErrors({});
      setPreview(result.preview);
      setPayment({
        ...result,
        billing: {
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          ...(fulfilment.method === "delivery"
            ? { line1: text("line1"), town: text("town"), postcode: text("postcode") }
            : {}),
        },
      });
    });
  }

  const errorEntries = Object.entries(fieldErrors);
  const sectionClass = "rounded-2xl border p-6";
  const labelClass = "text-sm font-medium";

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="flex min-w-0 flex-col gap-6">
        {payment ? (
          <section aria-labelledby="pay-heading" className={sectionClass}>
            <h2
              id="pay-heading"
              ref={paymentHeading}
              tabIndex={-1}
              className="flex items-center gap-2 text-xl font-semibold focus:outline-none"
            >
              <LockIcon className="size-5 text-primary" aria-hidden /> Pay securely
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Order {payment.orderNumber}. We’re holding your{" "}
              {preview.lines.length === 1 ? "phone" : "phones"} for you until{" "}
              <strong>
                {new Date(payment.expiresAt).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Europe/London",
                })}
              </strong>
              .
            </p>
            <div className="mt-6">
              {stripePublishableKey ? (
                <PaymentPanel
                  publishableKey={stripePublishableKey}
                  clientSecret={payment.clientSecret}
                  totalPence={payment.preview.totals.totalPence}
                  orderPath={payment.orderPath}
                  billing={payment.billing}
                />
              ) : (
                <div
                  data-testid="standin-payment"
                  data-payment-intent={payment.paymentIntentId}
                  data-amount={payment.preview.totals.totalPence}
                  className="rounded-xl border border-dashed p-4 text-sm"
                >
                  <p className="font-medium">Payments aren’t set up in this environment.</p>
                  <p className="mt-1 text-muted-foreground">
                    Add Stripe test keys to take test payments. Your order is waiting for payment.
                  </p>
                  <Link
                    href={payment.orderPath}
                    className="mt-3 inline-block font-medium text-primary underline underline-offset-4"
                  >
                    View your order
                  </Link>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPayment(null)}
              className="mt-6 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Change your details
            </button>
          </section>
        ) : (
          <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-6">
            <div ref={summaryRef} tabIndex={-1} className="focus:outline-none">
              {error ? (
                <div role="alert" className="rounded-xl border border-destructive p-4">
                  <p className="font-medium text-destructive">{error}</p>
                  {errorEntries.length ? (
                    <ul className="mt-2 list-disc pl-5 text-sm">
                      {errorEntries.map(([path, messages]) => (
                        <li key={path}>
                          <a href={`#${fieldId(path)}`} className="underline underline-offset-4">
                            {messages[0]}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {error.includes("basket") ? (
                    <Link
                      href="/basket"
                      className="mt-2 inline-block text-sm font-medium underline"
                    >
                      Go to your basket
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>

            <section aria-labelledby={`${id}-details`} className={sectionClass}>
              <h2 id={`${id}-details`} className="text-xl font-semibold">
                Your details
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  id={fieldId("email")}
                  label="Email"
                  error={fe("email")}
                  className="sm:col-span-2"
                >
                  <Input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    defaultValue={prefill?.email}
                  />
                </Field>
                <Field id={fieldId("name")} label="Full name" error={fe("name")}>
                  <Input
                    name="name"
                    autoComplete="name"
                    required
                    defaultValue={prefill?.name ?? undefined}
                  />
                </Field>
                <Field
                  id={fieldId("phone")}
                  label="Mobile number"
                  hint="For delivery and collection updates"
                  error={fe("phone")}
                >
                  <Input
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    required
                    defaultValue={prefill?.phone ?? undefined}
                  />
                </Field>
              </div>
            </section>

            <section aria-labelledby={`${id}-fulfilment`} className={sectionClass}>
              <h2 id={`${id}-fulfilment`} className="text-xl font-semibold">
                Delivery or collection
              </h2>
              <fieldset className="mt-4">
                <legend className="sr-only">How would you like to get your order?</legend>
                <div className="grid gap-3">
                  {deliveryOptions.map((option) => (
                    <Choice
                      key={option.key}
                      name="fulfilment"
                      checked={
                        fulfilment.method === "delivery" && fulfilment.deliveryOption === option.key
                      }
                      onChange={() =>
                        chooseFulfilment({ method: "delivery", deliveryOption: option.key })
                      }
                      title={`${option.label} · ${option.pricePence ? formatPrice(option.pricePence) : "Free"}`}
                      description={option.description}
                    />
                  ))}
                  <Choice
                    name="fulfilment"
                    checked={fulfilment.method === "click_and_collect"}
                    onChange={() =>
                      chooseFulfilment({ method: "click_and_collect", storeSlug: stores[0]!.slug })
                    }
                    title="Reserve and collect in store · Free"
                    description="Pay now and pick it up from one of our stores. Bring photo ID."
                  />
                </div>
              </fieldset>

              {fulfilment.method === "delivery" ? (
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {savedAddresses.length ? (
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <label htmlFor={`${id}-saved`} className="text-sm font-medium">
                        Saved addresses
                      </label>
                      <select
                        id={`${id}-saved`}
                        defaultValue={defaultAddress?.id}
                        onChange={(e) => fillSavedAddress(e.target.value)}
                        className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {savedAddresses.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.label ? `${a.label}: ` : ""}
                            {a.line1}, {a.town} {a.postcode}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <Field
                    id={fieldId("fulfilment.address.line1")}
                    label="Address line 1"
                    error={fe("fulfilment.address.line1")}
                    className="sm:col-span-2"
                  >
                    <Input
                      name="line1"
                      autoComplete="address-line1"
                      required
                      defaultValue={defaultAddress?.line1}
                    />
                  </Field>
                  <Field
                    id={fieldId("fulfilment.address.line2")}
                    label="Address line 2 (optional)"
                    className="sm:col-span-2"
                  >
                    <Input
                      name="line2"
                      autoComplete="address-line2"
                      defaultValue={defaultAddress?.line2 ?? undefined}
                    />
                  </Field>
                  <Field
                    id={fieldId("fulfilment.address.town")}
                    label="Town or city"
                    error={fe("fulfilment.address.town")}
                  >
                    <Input
                      name="town"
                      autoComplete="address-level2"
                      required
                      defaultValue={defaultAddress?.town}
                    />
                  </Field>
                  <Field id={fieldId("fulfilment.address.county")} label="County (optional)">
                    <Input
                      name="county"
                      autoComplete="address-level1"
                      defaultValue={defaultAddress?.county ?? undefined}
                    />
                  </Field>
                  <Field
                    id={fieldId("fulfilment.address.postcode")}
                    label="Postcode"
                    error={fe("fulfilment.address.postcode")}
                  >
                    <Input
                      name="postcode"
                      defaultValue={defaultAddress?.postcode}
                      autoComplete="postal-code"
                      className="uppercase"
                      required
                    />
                  </Field>
                </div>
              ) : (
                <fieldset className="mt-6">
                  <legend className={labelClass}>Collect from</legend>
                  <div
                    className="mt-2 grid gap-3 sm:grid-cols-2"
                    id={fieldId("fulfilment.storeSlug")}
                  >
                    {stores.map((store) => (
                      <Choice
                        key={store.slug}
                        name="store"
                        checked={fulfilment.storeSlug === store.slug}
                        onChange={() =>
                          chooseFulfilment({ method: "click_and_collect", storeSlug: store.slug })
                        }
                        title={`${store.name}, ${store.town}`}
                        description={`${store.street}, ${store.postcode}`}
                      />
                    ))}
                  </div>
                  {preview.collection ? (
                    <p className="mt-3 text-sm text-muted-foreground" role="status">
                      {preview.collection.sameDay
                        ? `Ready to collect from ${preview.collection.storeName}, ${preview.collection.storeTown} today. We’ll text you when it’s ready.`
                        : `We’ll move your phone to ${preview.collection.storeName}, ${preview.collection.storeTown}: usually ready in 2 working days. We’ll text you.`}
                    </p>
                  ) : null}
                </fieldset>
              )}
            </section>

            <section aria-labelledby={`${id}-tradein`} className={sectionClass}>
              <h2 id={`${id}-tradein`} className="text-xl font-semibold">
                Trade in your old phone (optional)
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Got a trade-in quote? Enter its reference and we’ll take its value off this order.
                Use the same email as your quote.{" "}
                <Link
                  href="/sell"
                  target="_blank"
                  className="font-medium text-primary underline underline-offset-4"
                >
                  Get a quote (opens in a new tab)
                </Link>
              </p>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <Field
                  id={fieldId("tradeInReference")}
                  label="Quote reference"
                  hint="For example RU-Q-7K2M9Q"
                  error={
                    fe("tradeInReference") ??
                    (preview.tradeIn && !preview.tradeIn.ok ? preview.tradeIn.message : undefined)
                  }
                  className="min-w-56 flex-1"
                >
                  <Input
                    value={tradeInRef}
                    onChange={(e) => setTradeInRef(e.target.value)}
                    autoComplete="off"
                    className="uppercase"
                  />
                </Field>
                {appliedTradeIn ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-10"
                    onClick={() => {
                      setAppliedTradeIn(undefined);
                      setTradeInRef("");
                      reprice({ tradeIn: null });
                    }}
                  >
                    Remove
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-10"
                    disabled={!tradeInRef.trim()}
                    onClick={() => {
                      const ref = tradeInRef.trim().toUpperCase();
                      setAppliedTradeIn(ref);
                      reprice({ tradeIn: ref });
                    }}
                  >
                    Apply
                  </Button>
                )}
              </div>
              {preview.tradeIn?.ok ? (
                <p className="mt-3 text-sm font-medium" role="status">
                  {preview.tradeIn.device} ({preview.tradeIn.reference}) applied.
                </p>
              ) : null}
            </section>

            {turnstileSiteKey ? (
              <TurnstileWidget
                siteKey={turnstileSiteKey}
                action="checkout"
                onToken={setTurnstileToken}
              />
            ) : null}
            <div className="flex flex-col gap-2">
              <Button
                type="submit"
                disabled={pending || pricing}
                className="min-h-12 self-start px-6 text-base"
              >
                {pending
                  ? "Reserving your phone…"
                  : `Continue to payment · ${formatPrice(preview.totals.totalPence)}`}
              </Button>
              <p className="text-sm text-muted-foreground">
                We hold your phone for 15 minutes while you pay by card, Apple Pay, Google Pay or
                Klarna.
              </p>
            </div>
          </form>
        )}
      </div>

      <OrderSummary preview={preview} updating={pricing} error={previewError} />
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactElement<React.ComponentProps<"input">>;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  const child = cloneElement(children, {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy || undefined,
  });
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {child}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Choice({
  name,
  checked,
  onChange,
  title,
  description,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-4 has-checked:border-primary has-checked:bg-primary/5">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 size-5 shrink-0 accent-(--primary)"
      />
      <span className="flex flex-col">
        <span className="font-medium">{title}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}
