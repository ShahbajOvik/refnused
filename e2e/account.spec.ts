import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Cookie, type Page } from "@playwright/test";

/*
 * /account with the demo customers from src/db/seed/demo.ts (test snapshot
 * only). Customers sign in with the real magic-link flow: the e2e server
 * writes emails to .test-db/outbox, which these tests read like an inbox.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ mode: "serial", timeout: 90_000 });

const OUTBOX = join(process.cwd(), ".test-db", "outbox");
const ALEX = "demo.alex@example.co.uk";
const DEE = "demo.dee@example.co.uk";

type Email = { to: string; subject: string; text: string; sentAt: string };

/** Waits for the newest email to `to` sent after `since` that matches. */
async function latestEmail(to: string, since: number, match: RegExp): Promise<Email> {
  let found: Email | undefined;
  await expect
    .poll(
      () => {
        let files: string[] = [];
        try {
          files = readdirSync(OUTBOX);
        } catch {
          return false;
        }
        found = files
          .filter((f) => f.endsWith(".json"))
          .map((f) => JSON.parse(readFileSync(join(OUTBOX, f), "utf8")) as Email)
          .filter((e) => e.to === to && Date.parse(e.sentAt) >= since && match.test(e.subject))
          .sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
        return Boolean(found);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return found!;
}

/*
 * Sign-in links are limited to 5 an hour per address (magic-link-guard.ts),
 * so each demo customer signs in by email once per run and later tests
 * reuse the session cookie. If that session has ended (signed out, account
 * deleted), sign in again.
 */
const sessions = new Map<string, Cookie[]>();

async function signIn(page: Page, email: string) {
  const saved = sessions.get(email);
  if (saved) {
    await page.context().addCookies(saved);
    await page.goto("/account");
    if (new URL(page.url()).pathname === "/account") return;
    sessions.delete(email);
  }
  await signInByEmail(page, email);
  sessions.set(
    email,
    (await page.context().cookies()).filter((c) => /ru\.session/.test(c.name)),
  );
}

async function signInByEmail(page: Page, email: string) {
  const since = Date.now() - 1000;
  await page.goto("/sign-in?callbackUrl=%2Faccount");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page).toHaveURL(/verify-request|check-email/);
  const message = await latestEmail(email, since, /^Sign in to/);
  const link = message.text.match(/https?:\/\/\S+\/api\/auth\/callback\/resend\?\S+/)![0];
  await page.goto(link);
  await expect(page).toHaveURL(/\/account$/);
}

async function emailedCode(email: string, since: number) {
  const message = await latestEmail(email, since, /^Your RefurbednUsed code: \d{6}$/);
  return message.subject.slice(-6);
}

test.beforeEach(async ({ page }) => {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.18.1.${octet()}, 10.0.3.${octet()}` });
});

test("overview links to the sections and flags revised offers", async ({ page }) => {
  await signIn(page, ALEX);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your account");
  await expect(
    page.getByRole("link", { name: /Trade-ins 2 revised offers need your answer/ }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Account" });
  await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
});

test("trade-ins: timeline, accept one revised offer and send another phone back", async ({
  page,
}) => {
  await signIn(page, ALEX);
  await page.goto("/account/quotes");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your trade-ins");
  const timelines = page.getByRole("list", { name: /^Progress of trade-in RU-Q-/ });
  await expect(timelines).toHaveCount(4);
  await expect(page.getByText("Waiting for your phone")).toBeVisible();

  const accept = page.getByRole("button", { name: "Accept £160.00" });
  await accept.click();
  await expect(
    page.getByRole("status").filter({ hasText: "You accepted the new offer." }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Send my phone back" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "You asked for your phone back." }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByText("You accepted the new offer.")).toBeVisible();
  await expect(page.getByText("You asked for your phone back.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Accept £/ })).toHaveCount(0);
});

test("orders: tracking link and a warranty claim from the account", async ({ page }) => {
  await signIn(page, ALEX);
  await page.goto("/account/orders");
  const order = page.getByRole("article", { name: "Order RU-900001" });
  await expect(order.getByRole("link", { name: /Track with Royal Mail/ })).toHaveAttribute(
    "href",
    "https://www.royalmail.com/track-your-item#/tracking-results/AB123456789GB",
  );
  await expect(order.getByRole("list", { name: "Progress of order RU-900001" })).toContainText(
    "Royal Mail tracking AB123456789GB",
  );
  await expect(page.getByRole("article", { name: "Order RU-900002" })).toContainText(
    "Ready to collect",
  );

  await order.getByText(/^Returns and warranty:/).click();
  const form = order.getByRole("form", { name: /Return or warranty claim/ });
  await form.getByRole("radio", { name: "Report a fault (warranty)" }).check();
  await form.getByLabel("What’s wrong?").selectOption("battery");
  await form.getByLabel("Describe the fault").fill("Battery drains overnight.");
  await form.getByRole("button", { name: "Send warranty claim" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /Warranty claim sent \(RU-W-/ }),
  ).toBeVisible();
});

test("addresses: add, make default and delete", async ({ page }) => {
  await signIn(page, ALEX);
  await page.goto("/account/addresses");
  const add = page.getByRole("form", { name: "Add an address" });
  await add.getByRole("button", { name: "Save address" }).click();
  await expect(add.getByText("Enter the first line of the address")).toBeVisible();
  await add.getByLabel("Label (optional)").fill("Work");
  await add.getByLabel("Full name").fill("Alex Demo");
  await add.getByLabel("Address line 1").fill("5 Work Street");
  await add.getByLabel("Town or city").fill("Newcastle");
  await add.getByLabel("Postcode").fill("ne1 4st");
  await add.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByRole("heading", { name: "Work" })).toBeVisible();
  await expect(page.getByText("NE1 4ST")).toBeVisible();

  await page.getByRole("button", { name: /^Make default\s+for 5 Work Street$/ }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Default address changed." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete 5 Work Street" }).click();
  await expect(page.getByRole("heading", { name: "Work" })).toHaveCount(0);
});

test("payout details: masked, and changing them needs an emailed code", async ({ page }) => {
  await signIn(page, ALEX);
  await page.goto("/account/payout");
  const since = Date.now() - 1000;
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "We’ve emailed a 6-digit code" }),
  ).toBeVisible();
  const code = await emailedCode(ALEX, since);

  const form = page.getByRole("form", { name: "New payout details" });
  await form.getByLabel("Code from the email").fill(code === "000000" ? "111111" : "000000");
  await form.getByLabel("Name on the account").fill("Alex Demo");
  await form.getByLabel("Sort code").fill("20-00-99");
  await form.getByLabel("Account number").fill("55556789");
  await form.getByRole("button", { name: "Save payout details" }).click();
  await expect(form.getByRole("alert")).toContainText("That code isn’t right");

  await form.getByLabel("Code from the email").fill(code);
  await form.getByRole("button", { name: "Save payout details" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Payout details saved." })).toBeVisible();
  const summary = page.getByTestId("payout-summary");
  await expect(summary).toContainText("••-••-99");
  await expect(summary).toContainText("Ending 6789");
  await expect(page.locator("body")).not.toContainText("55556789");
});

test("alerts: create, pause and delete a price alert", async ({ page }) => {
  await signIn(page, ALEX);
  await page.goto("/account/alerts");
  const form = page.getByRole("form", { name: "New price alert" });
  await form.getByLabel("Phone", { exact: true }).selectOption("iphone-16");
  await form.getByLabel("Target price (£)").fill("450");
  await form.getByLabel("Condition (optional)").selectOption("A");
  await form.getByRole("button", { name: "Set alert" }).click();
  const what = "Refurbished Apple iPhone 16 (grade A) at £450.00 or less";
  await expect(page.getByText(what, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Pause\s+alert:/ }).click();
  await expect(page.getByRole("button", { name: /^Resume\s+alert:/ })).toBeVisible();
  await page.getByRole("button", { name: /^Delete\s+alert:/ }).click();
  await expect(page.getByText(what, { exact: true })).toHaveCount(0);
});

test("privacy: marketing choices, data download, and deletion blocked while busy", async ({
  page,
}) => {
  await signIn(page, ALEX);
  await page.goto("/account/privacy");
  const marketing = page.getByRole("form", { name: "Marketing preferences" });
  await marketing.getByRole("checkbox", { name: /Emails/ }).check();
  await marketing.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByTestId("account-announcer")).toHaveText("Preferences saved.");
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /Emails/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /Texts/ })).not.toBeChecked();

  const response = await page.request.get("/account/export");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toMatch(
    /attachment; filename="refurbednused-my-data-/,
  );
  const data = await response.json();
  expect(data.profile.email).toBe(ALEX);
  expect(data.tradeIns.length).toBe(4);
  expect(JSON.stringify(data)).not.toMatch(/11223344|55556789|Encrypted/);

  await expect(
    page.getByText("You can delete your account once these are finished:"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete my account" })).toHaveCount(0);
});

test("checkout fills in saved details for signed-in customers", async ({ page }) => {
  await signIn(page, ALEX);
  await page.goto("/shop/samsung/galaxy-s24-256gb-marble-grey-w4a8ek");
  await expect(async () => {
    const add = page.getByRole("button", { name: "Add to basket" });
    if (await add.isVisible()) await add.click();
    await expect(page.getByRole("status").filter({ hasText: "In your basket" })).toBeVisible({
      timeout: 5000,
    });
  }).toPass({ timeout: 30_000 });
  await page.goto("/checkout");
  await expect(page.getByLabel("Email")).toHaveValue(ALEX);
  await expect(page.getByLabel("Address line 1")).toHaveValue("1 Demo Street");
  await expect(page.getByLabel("Postcode")).toHaveValue("NE29 6RR");
});

test("deleting an account signs out and erases it", async ({ page }) => {
  await signIn(page, DEE);
  await page.goto("/account/privacy");
  const since = Date.now() - 1000;
  await page.getByRole("button", { name: "Send me a code" }).click();
  const code = await emailedCode(DEE, since);
  const form = page.getByRole("form", { name: "Delete your account" });
  await form.getByLabel("Code from the email").fill(code);
  await form.getByRole("button", { name: "Delete my account" }).click();
  await expect(form.getByText("Type DELETE to confirm").last()).toBeVisible();
  await form.getByLabel("Type DELETE to confirm").fill("DELETE");
  await form.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/account-deleted$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your account has been deleted");
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("account pages have no WCAG 2.2 AA violations", async ({ page }) => {
  await signIn(page, ALEX);
  for (const path of [
    "/account",
    "/account/quotes",
    "/account/orders",
    "/account/privacy",
    "/account/payout",
  ]) {
    await page.goto(path);
    await expect(page.locator("[data-slot='skeleton']")).toHaveCount(0, { timeout: 30_000 });
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(scan.violations.map((v) => `${path} ${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  }
});
