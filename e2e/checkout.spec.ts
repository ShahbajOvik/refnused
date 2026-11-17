import { randomBytes } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type APIRequestContext, type Page } from "@playwright/test";
import Stripe from "stripe";

/*
 * Full purchase flow. Runs after the other suites (see playwright.config.ts)
 * because it sells sample units.
 *
 * Payments:
 * - Default (no Stripe keys): the app uses its stand-in gateway, and these
 *   tests act as Stripe by sending signed webhooks to /api/stripe/webhook.
 * - With E2E_STRIPE_SECRET_KEY / E2E_STRIPE_PUBLISHABLE_KEY (test mode),
 *   the real Payment Element is filled with Stripe's test card, then the
 *   PaymentIntent is fetched from Stripe and delivered as a signed webhook
 *   (unless E2E_STRIPE_FORWARDING=1, i.e. `stripe listen` forwards events).
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 90_000 });

const WEBHOOK_SECRET = process.env.E2E_STRIPE_WEBHOOK_SECRET ?? "whsec_e2e_test_secret_not_real";
const STRIPE_SECRET = process.env.E2E_STRIPE_SECRET_KEY;
const REAL_STRIPE = Boolean(STRIPE_SECRET && process.env.E2E_STRIPE_PUBLISHABLE_KEY);

test.beforeEach(async ({ page }) => {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `192.0.2.${octet()}, 10.0.2.${octet()}` });
});

const uniqueEmail = () => `buyer.${Date.now()}.${randomBytes(3).toString("hex")}@example.co.uk`;

async function sendWebhook(request: APIRequestContext, event: object) {
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return request.post("/api/stripe/webhook", {
    data: payload,
    headers: { "stripe-signature": signature, "content-type": "application/json" },
  });
}

function intentEvent(
  type: string,
  intent: Record<string, unknown>,
  id = `evt_e2e_${randomBytes(8).toString("hex")}`,
) {
  return {
    id,
    object: "event",
    type,
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: { object: "payment_intent", currency: "gbp", ...intent } },
  };
}

async function addToBasket(page: Page, productPath: string) {
  await page.goto(productPath);
  const button = page.getByRole("button", { name: "Add to basket" });
  const added = page.getByRole("status").filter({ hasText: "In your basket" });
  // Retry until hydrated: a click before then does nothing.
  await expect(async () => {
    if (await button.isVisible()) await button.click();
    await expect(added).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 30_000 });
}

async function fillDetails(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Full name").fill("Sam Buyer");
  await page.getByLabel("Mobile number").fill("07700 900456");
}

/**
 * Pays on the payment step. Returns once the order page shows the payment
 * as confirmed by the webhook.
 */
async function pay(page: Page, request: APIRequestContext, expectedPence: number) {
  if (!REAL_STRIPE) {
    const panel = page.getByTestId("standin-payment");
    await expect(panel).toBeVisible();
    const paymentIntentId = (await panel.getAttribute("data-payment-intent"))!;
    // The amount comes from the server, before payment.
    expect(Number(await panel.getAttribute("data-amount"))).toBe(expectedPence);

    const event = intentEvent("payment_intent.succeeded", {
      id: paymentIntentId,
      amount: expectedPence,
      amount_received: expectedPence,
      status: "succeeded",
    });
    const first = await sendWebhook(request, event);
    expect(first.status()).toBe(200);
    expect(await first.json()).toMatchObject({ outcome: "paid" });
    // Stripe may deliver the same event twice: nothing happens the second time.
    const again = await sendWebhook(request, event);
    expect(await again.json()).toMatchObject({ outcome: "duplicate" });

    await panel.getByRole("link", { name: "View your order" }).click();
    return;
  }

  // Stripe test mode: the real Payment Element.
  const frame = page.frameLocator('iframe[title="Secure payment input frame"]').first();
  await frame
    .getByRole("tab", { name: /card/i })
    .click()
    .catch(() => {});
  await frame.getByLabel(/card number/i).fill("4242 4242 4242 4242");
  await frame.getByLabel(/expiration|expiry/i).fill("12 / 34");
  await frame.getByLabel(/security code|cvc/i).fill("123");
  const postcode = frame.getByLabel(/postal code|postcode/i);
  if (await postcode.isVisible().catch(() => false)) await postcode.fill("NE29 6RR");
  await page.getByTestId("pay-button").click();
  await page.waitForURL(/\/orders\/[\w-]+\?.*payment_intent=pi_/, { timeout: 60_000 });

  if (process.env.E2E_STRIPE_FORWARDING !== "1") {
    const paymentIntentId = new URL(page.url()).searchParams.get("payment_intent")!;
    const intent = await new Stripe(STRIPE_SECRET!).paymentIntents.retrieve(paymentIntentId);
    expect(intent.amount_received).toBe(expectedPence);
    const response = await sendWebhook(
      request,
      intentEvent("payment_intent.succeeded", intent as unknown as Record<string, unknown>),
    );
    expect(response.status()).toBe(200);
  }
}

test.describe("basket", () => {
  test("add, view and remove", async ({ page }) => {
    await addToBasket(page, "/shop/samsung/galaxy-s24-256gb-marble-grey-w4a8ek");
    await expect(page.getByTestId("basket-count")).toHaveText("1");
    await page.getByRole("link", { name: "View basket" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your basket");
    await expect(page.getByTestId("basket-subtotal")).toHaveText("£299.00");
    await page.getByRole("button", { name: /^Remove Samsung Galaxy S24/ }).click();
    await expect(page.getByText("Your basket is empty.")).toBeVisible();
    await expect(page.getByTestId("basket-count")).toHaveCount(0);
  });
});

test.describe("purchase", () => {
  test("home delivery: full price before payment, paid by webhook, then a return", async ({
    page,
    request,
  }) => {
    await addToBasket(page, "/shop/samsung/galaxy-a55-128gb-awesome-navy-w4f7yh");
    await page.getByRole("link", { name: "Checkout" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Checkout");
    await expect(page.getByTestId("summary-total")).toHaveText("£159.00");

    await fillDetails(page, uniqueEmail());
    await page.getByRole("radio", { name: /^Next working day/ }).check();
    // Delivery is in the total before anything is paid.
    await expect(page.getByTestId("summary-delivery")).toHaveText("£5.99");
    await expect(page.getByTestId("summary-total")).toHaveText("£164.99");

    // Server-side validation with an error summary.
    await page.getByRole("button", { name: /^Continue to payment/ }).click();
    const summary = page
      .getByRole("alert")
      .filter({ hasText: "Please check the highlighted details" });
    await expect(summary.getByRole("link", { name: /first line of the address/ })).toBeVisible();

    await page.getByLabel("Address line 1").fill("2 Test Road");
    await page.getByLabel("Town or city").fill("Tynemouth");
    await page.getByLabel("Postcode").fill("ne30 4aa");
    await page.getByRole("button", { name: "Continue to payment · £164.99" }).click();

    await expect(page.getByRole("heading", { name: "Pay securely" })).toBeFocused();
    await expect(page.getByText(/We’re holding your phone for you until \d\d:\d\d/)).toBeVisible();
    await pay(page, request, 16499);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Thank you, your order is confirmed",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("order-total")).toHaveText("£164.99");
    await expect(page.getByText("Next working day").first()).toBeVisible();
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
    // The basket is emptied once paid.
    await expect(page.getByTestId("basket-count")).toHaveCount(0);

    // 14-day return.
    const form = page.getByRole("form", {
      name: /Return or warranty claim for Samsung Galaxy A55/,
    });
    await form.getByLabel("Reason").selectOption("changed_mind");
    await form.getByLabel("Anything else we should know?").fill("Too big for my hands.");
    await form.getByRole("button", { name: "Request a return" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /Return requested \(RU-R-[0-9A-Z]{6}\)/ }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Return RU-R-[0-9A-Z]{6}: I changed my mind/)).toBeVisible();
    // A second return for the same phone isn't offered; a warranty claim still is.
    const after = page.getByRole("form", { name: /Return or warranty claim/ });
    await after.getByRole("radio", { name: "Report a fault (warranty)" }).check();
    await after.getByLabel("What’s wrong?").selectOption("battery");
    await after.getByLabel("Describe the fault").fill("Battery drains overnight.");
    await after.getByRole("button", { name: "Send warranty claim" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /Warranty claim sent \(RU-W-/ }),
    ).toBeVisible();
  });

  test("reserve and collect in store with a trade-in credit", async ({ page, request }) => {
    test.skip(REAL_STRIPE, "Covered by the delivery test in Stripe test mode");
    // Get a trade-in quote first (iPhone 15 128GB, grade B: £220).
    const email = uniqueEmail();
    await page.goto("/sell/apple/iphone-15");
    await expect(async () => {
      await page.getByRole("radio", { name: "128GB" }).check({ timeout: 2000 });
      await page.getByRole("radio", { name: "Black" }).check();
      await page.getByRole("radio", { name: "Unlocked" }).check();
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page.getByRole("radio", { name: /^Yes, everything works/ })).toBeVisible({
        timeout: 2000,
      });
    }).toPass({ timeout: 30_000 });
    for (const answer of [
      /^Yes, everything works/,
      /^Light scratches/,
      /^Like new/,
      /^85% or more/,
    ]) {
      await page.getByRole("radio", { name: answer }).check();
      await page.getByRole("button", { name: "Continue" }).click();
    }
    await page.getByRole("radio", { name: /^Yes, it works/ }).check();
    await page.getByRole("button", { name: "See my offer" }).click();
    await expect(page.getByTestId("offer-amount")).toHaveText("£220.00");
    await page.getByRole("button", { name: "Accept and continue" }).click();
    await page.getByLabel("Full name").fill("Sam Buyer");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mobile number").fill("07700 900456");
    await page.getByLabel("Address line 1").fill("2 Test Road");
    await page.getByLabel("Town or city").fill("Tynemouth");
    await page.getByLabel("Postcode").fill("NE30 4AA");
    const imeiBody = "35" + String(Math.floor(Math.random() * 1e12)).padStart(12, "0");
    let imei = "";
    for (let check = 0; check <= 9 && !imei; check++) {
      const digits = imeiBody + check;
      let sum = 0;
      for (let i = 0; i < 15; i++) {
        let d = Number(digits[14 - i]);
        if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
        sum += d;
      }
      if (sum % 10 === 0) imei = digits;
    }
    await page.getByLabel("IMEI number").fill(imei);
    await page.getByLabel("Name on the account").fill("Sam Buyer");
    await page.getByLabel("Sort code").fill("12-34-56");
    await page.getByLabel("Account number").fill("12345678");
    await page.getByRole("checkbox", { name: /I own this phone/ }).check();
    await page.getByRole("checkbox", { name: /Find My iPhone/ }).check();
    await page.getByRole("button", { name: /Accept £220.00/ }).click();
    const referenceText = await page.getByText(/^Reference RU-Q-[0-9A-Z]{6}$/).textContent();
    const reference = referenceText!.replace("Reference ", "");

    // Buy an iPhone 15 (£379) and collect it from MetroTech, where it already is.
    await addToBasket(page, "/shop/apple/iphone-15-128gb-pink-c3g9ns");
    await page.goto("/checkout");
    await fillDetails(page, email);
    await page.getByRole("radio", { name: /^Reserve and collect in store/ }).check();
    await page.getByRole("radio", { name: /^MetroTech, North Shields/ }).check();
    await expect(
      page.getByText("Ready to collect from MetroTech today.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByTestId("summary-delivery")).toHaveText("Free");

    await page.getByLabel("Quote reference").fill(reference.toLowerCase());
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(
      page.getByText(`iPhone 15, 128GB (${reference}) applied.`, { exact: false }),
    ).toBeVisible();
    await expect(page.getByTestId("summary-trade-in")).toHaveText("−£220.00");
    await expect(page.getByTestId("summary-total")).toHaveText("£159.00");

    await page.getByRole("button", { name: "Continue to payment · £159.00" }).click();
    await pay(page, request, 15900);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Thank you, your order is confirmed",
    );
    await expect(page.getByText(`Trade-in credit (${reference})`)).toBeVisible();
    await expect(page.getByTestId("order-total")).toHaveText("£159.00");
    await expect(page.getByRole("heading", { name: "Click and collect" })).toBeVisible();
  });

  test("a trade-in quote only works with the email it was made with", async ({ page }) => {
    await addToBasket(page, "/shop/samsung/galaxy-s24-256gb-marble-grey-w4a8ek");
    await page.goto("/checkout");
    await fillDetails(page, uniqueEmail());
    await page.getByLabel("Quote reference").fill("RU-Q-ZZZZZZ");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(/We couldn’t find that quote for this email/)).toBeVisible();
    await expect(page.getByTestId("summary-total")).toHaveText("£299.00");
  });
});

test.describe("holds and failures", () => {
  test("a phone being paid for is held for 15 minutes", async ({ page, browser, request }) => {
    test.skip(REAL_STRIPE, "Uses the stand-in gateway's order ids");
    const product = "/shop/google/pixel-8a-128gb-obsidian-t8y4ch";
    await addToBasket(page, product);
    await page.goto("/checkout");
    await fillDetails(page, uniqueEmail());
    await page.getByRole("radio", { name: /^Reserve and collect in store/ }).check();
    await page.getByRole("button", { name: /^Continue to payment/ }).click();
    await expect(page.getByRole("heading", { name: "Pay securely" })).toBeVisible();

    // Someone else, in another browser, can't add it now.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.setExtraHTTPHeaders({ "x-forwarded-for": "198.18.0.9" });
    await otherPage.goto(product);
    const refused = otherPage
      .getByRole("alert")
      .filter({ hasText: "Sorry, this phone has just been sold or reserved." });
    await expect(async () => {
      await otherPage.getByRole("button", { name: "Add to basket" }).click({ timeout: 2000 });
      await expect(refused).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 30_000 });
    await other.close();

    // A declined card: the order stays open to try again.
    const intent = await page.getByTestId("standin-payment").getAttribute("data-payment-intent");
    await sendWebhook(
      request,
      intentEvent("payment_intent.payment_failed", {
        id: intent,
        last_payment_error: { message: "Your card was declined." },
      }),
    );
    await page.getByRole("link", { name: "View your order" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Waiting for payment");
    await expect(
      page.getByText("Your payment didn’t go through: Your card was declined."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Go back to checkout" })).toBeVisible();
  });
});

test.describe("webhook security", () => {
  test("rejects unsigned and wrongly signed requests", async ({ request }) => {
    const payload = JSON.stringify(
      intentEvent("payment_intent.succeeded", { id: "pi_x", amount_received: 1 }),
    );
    const unsigned = await request.post("/api/stripe/webhook", { data: payload });
    expect(unsigned.status()).toBe(400);
    const forged = await request.post("/api/stripe/webhook", {
      data: payload,
      headers: {
        "stripe-signature": Stripe.webhooks.generateTestHeaderString({
          payload,
          secret: "whsec_someone_else",
        }),
      },
    });
    expect(forged.status()).toBe(400);
    // Correctly signed but for an unknown payment: acknowledged, ignored.
    const unknown = await sendWebhook(
      request,
      intentEvent("payment_intent.succeeded", { id: "pi_unknown", amount_received: 100 }),
    );
    expect(unknown.status()).toBe(200);
    expect(await unknown.json()).toMatchObject({ outcome: "ignored" });
  });

  test("an unknown order link shows not found", async ({ page }) => {
    await page.goto(`/orders/${"x".repeat(32)}`);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });
});

test.describe("accessibility", () => {
  test("checkout has no WCAG 2.2 AA violations", async ({ page }) => {
    await addToBasket(page, "/shop/samsung/galaxy-s24-256gb-marble-grey-w4a8ek");
    await page.goto("/checkout");
    await expect(page.getByTestId("summary-total")).toBeVisible();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const scan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(scan.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
    }
  });
});
