import "server-only";

import { serverEnv } from "@/lib/env.server";

import { createStandInGateway, createStripeGateway, type PaymentGateway } from "./gateway";

let gateway: PaymentGateway | undefined;

/** Real Stripe when STRIPE_SECRET_KEY is set, otherwise the stand-in (never in production). */
export function getPaymentGateway(): PaymentGateway {
  gateway ??= serverEnv.STRIPE_SECRET_KEY
    ? createStripeGateway(serverEnv.STRIPE_SECRET_KEY)
    : createStandInGateway();
  return gateway;
}
