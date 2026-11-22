import { randomBytes } from "node:crypto";

import Stripe from "stripe";

/*
 * The small part of Stripe that checkout uses, behind an interface so the
 * checkout and webhook services can be tested without the network.
 */

export type CreatedPaymentIntent = { id: string; clientSecret: string };

export type PaymentGateway = {
  /** "stripe" for real (test or live) Stripe; "standin" in development/tests without keys. */
  mode: "stripe" | "standin";
  createPaymentIntent(
    input: {
      amountPence: number;
      orderId: string;
      orderNumber: string;
      email: string;
    },
    /** Stripe idempotency key: retries never create a second intent. */
    idempotencyKey: string,
  ): Promise<CreatedPaymentIntent>;
  /**
   * Cancels an unpaid intent so it can never be charged. "not_cancelable"
   * means it has succeeded or is processing (e.g. Klarna), so the order
   * must keep its units.
   */
  cancelPaymentIntent(id: string): Promise<"canceled" | "not_cancelable">;
  /** Refunds a payment: in full, or `amountPence` of it. */
  refund(paymentIntentId: string, idempotencyKey: string, amountPence?: number): Promise<void>;
};

export function createStripeGateway(secretKey: string): PaymentGateway {
  const stripe = new Stripe(secretKey, {
    appInfo: { name: "RefurbednUsed" },
    maxNetworkRetries: 2,
    timeout: 20_000,
  });
  return {
    mode: "stripe",
    async createPaymentIntent(input, idempotencyKey) {
      const intent = await stripe.paymentIntents.create(
        {
          amount: input.amountPence,
          currency: "gbp",
          // Cards, Apple Pay, Google Pay and Klarna: whichever are enabled in
          // the Stripe Dashboard and suit the amount and customer.
          automatic_payment_methods: { enabled: true },
          receipt_email: input.email,
          description: `RefurbednUsed order ${input.orderNumber}`,
          metadata: { orderId: input.orderId, orderNumber: input.orderNumber },
        },
        { idempotencyKey },
      );
      if (!intent.client_secret) throw new Error("Stripe returned no client secret");
      return { id: intent.id, clientSecret: intent.client_secret };
    },
    async cancelPaymentIntent(id) {
      try {
        await stripe.paymentIntents.cancel(id);
        return "canceled";
      } catch (error) {
        // Already canceled counts as canceled; succeeded/processing can't be.
        const intent = await stripe.paymentIntents.retrieve(id).catch(() => null);
        if (intent?.status === "canceled") return "canceled";
        if (intent) return "not_cancelable";
        throw error;
      }
    },
    async refund(paymentIntentId, idempotencyKey, amountPence) {
      await stripe.refunds.create(
        { payment_intent: paymentIntentId, ...(amountPence ? { amount: amountPence } : {}) },
        { idempotencyKey },
      );
    },
  };
}

/**
 * Stand-in for local development and automated tests when no Stripe keys
 * are set. It never takes money: intents only "succeed" when a correctly
 * signed webhook says so, exactly as with Stripe. Refused in production.
 */
export function createStandInGateway(): PaymentGateway {
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("The stand-in payment gateway can't be used in production");
  }
  return {
    mode: "standin",
    async createPaymentIntent() {
      const id = `pi_standin_${randomBytes(12).toString("hex")}`;
      return { id, clientSecret: `${id}_secret_${randomBytes(12).toString("hex")}` };
    },
    async cancelPaymentIntent() {
      return "canceled";
    },
    async refund(paymentIntentId) {
      console.info(`[payments] stand-in refund for ${paymentIntentId}`);
    },
  };
}

/** Verifies a webhook's Stripe-Signature header and parses the event. Throws if invalid. */
export function verifyStripeWebhook(payload: string, signature: string, secret: string) {
  return Stripe.webhooks.constructEvent(payload, signature, secret);
}

export type StripeEvent = Stripe.Event;
export type StripePaymentIntent = Stripe.PaymentIntent;
export type StripeCharge = Stripe.Charge;
