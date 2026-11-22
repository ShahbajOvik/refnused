"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatPrice } from "@refnused/database/lib/format";

const stripePromises = new Map<string, Promise<Stripe | null>>();
function getStripe(key: string) {
  if (!stripePromises.has(key)) stripePromises.set(key, loadStripe(key));
  return stripePromises.get(key)!;
}

type Billing = {
  name: string;
  email: string;
  phone: string;
  line1?: string;
  town?: string;
  postcode?: string;
};

/**
 * Stripe Payment Element: cards, Apple Pay, Google Pay and Klarna (as
 * enabled in the Stripe Dashboard). The amount is fixed by the server's
 * PaymentIntent; this page can't change it. The order is only marked paid
 * when Stripe's webhook confirms the payment.
 */
export default function PaymentPanel({
  publishableKey,
  clientSecret,
  totalPence,
  orderPath,
  billing,
}: {
  publishableKey: string;
  clientSecret: string;
  totalPence: number;
  orderPath: string;
  billing: Billing;
}) {
  return (
    <Elements
      stripe={getStripe(publishableKey)}
      options={{
        clientSecret,
        locale: "en-GB",
        appearance: {
          theme: "stripe",
          variables: { colorPrimary: "#0f7a55", borderRadius: "8px", fontSizeBase: "16px" },
        },
      }}
    >
      <PayForm totalPence={totalPence} orderPath={orderPath} billing={billing} />
    </Elements>
  );
}

function PayForm({
  totalPence,
  orderPath,
  billing,
}: {
  totalPence: number;
  orderPath: string;
  billing: Billing;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  async function pay(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: new URL(orderPath, window.location.origin).href },
    });
    // Only reached if the payment couldn't start (e.g. card declined);
    // otherwise the browser goes to the order page.
    setError(stripeError?.message ?? "Your payment didn’t go through. Please try again.");
    setSubmitting(false);
  }

  return (
    <form onSubmit={pay} className="flex flex-col gap-4">
      <PaymentElement
        onReady={() => setReady(true)}
        options={{
          layout: "tabs",
          defaultValues: {
            billingDetails: {
              name: billing.name,
              email: billing.email,
              phone: billing.phone,
              address: {
                country: "GB",
                line1: billing.line1,
                city: billing.town,
                postal_code: billing.postcode,
              },
            },
          },
        }}
      />
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={!stripe || !ready || submitting}
        className="min-h-12 text-base"
        data-testid="pay-button"
      >
        {submitting ? "Processing…" : `Pay ${formatPrice(totalPence)}`}
      </Button>
    </form>
  );
}
