import { expect, type Page } from "@playwright/test";

/** A random IMEI with a valid Luhn check digit (each quote needs its own). */
export function uniqueImei() {
  const body = "35" + String(Math.floor(Math.random() * 1e12)).padStart(12, "0");
  for (let check = 0; check <= 9; check++) {
    const digits = body + check;
    let sum = 0;
    for (let i = 0; i < 15; i++) {
      let d = Number(digits[14 - i]);
      if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
      sum += d;
    }
    if (sum % 10 === 0) return digits;
  }
  throw new Error("unreachable");
}

export const uniqueEmail = () =>
  `e2e.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.co.uk`;

/** Sample prices from the seed: iPhone 15 128GB is £260 at grade A, £220 at grade B. */
export async function answerToOffer(page: Page) {
  await page.goto("/sell/apple/iphone-15");
  await page.getByRole("radio", { name: "128GB" }).check();
  await page.getByRole("radio", { name: "Black" }).check();
  await page.getByRole("radio", { name: "Unlocked" }).check();
  await page.getByRole("button", { name: "Continue" }).click();

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
}

/** Accepts the offer for store drop-off and returns the tracking page path. */
export async function createQuote(page: Page): Promise<string> {
  await answerToOffer(page);
  await page.getByRole("radio", { name: /^Drop it off in store/ }).check();
  await page.getByRole("radio", { name: /^FairTech, South Shields/ }).check();
  await page.getByRole("button", { name: "Accept and continue" }).click();
  await page.getByLabel("Full name").fill("Jo Bloggs");
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Mobile number").fill("07700 900123");
  await page.getByLabel("Address line 1").fill("1 Test Street");
  await page.getByLabel("Town or city").fill("South Shields");
  await page.getByLabel("Postcode").fill("NE33 1HT");
  await page.getByLabel("IMEI number").fill(uniqueImei());
  await page.getByLabel("Name on the account").fill("Jo Bloggs");
  await page.getByLabel("Sort code").fill("12-34-56");
  await page.getByLabel("Account number").fill("12345678");
  await page.getByRole("checkbox", { name: /I own this phone/ }).check();
  await page.getByRole("checkbox", { name: /Find My iPhone/ }).check();
  await page.getByRole("button", { name: /^Accept £/ }).click();
  await expect(page).toHaveURL(/\/sell\/track\/[\w-]{20,}$/, { timeout: 15_000 });
  return new URL(page.url()).pathname;
}
