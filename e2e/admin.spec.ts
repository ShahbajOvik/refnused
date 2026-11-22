import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import {
  expect as baseExpect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { generateTotp } from "../src/auth/totp";

/*
 * Admin, with the demo staff and customer "Sam" from src/db/seed/demo.ts
 * (test snapshot only). Staff sign in for real: magic link from the test
 * outbox, then a TOTP code. Each role signs in once (codes can't be reused
 * within 30 seconds) and the session is shared by the tests.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ mode: "serial", timeout: 120_000 });

const OUTBOX = join(process.cwd(), ".test-db", "outbox");
const TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const OWNER = "demo.owner@example.co.uk";
const STAFF = "demo.staff@example.co.uk";
const SAM = "demo.sam@example.co.uk";

type Email = { to: string; subject: string; text: string; sentAt: string };

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

async function staffSession(browser: Browser, email: string): Promise<BrowserContext> {
  const context = await browser.newContext({ locale: "en-GB", timezoneId: "Europe/London" });
  const page = await context.newPage();
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `198.18.2.${Math.floor(Math.random() * 250) + 1}`,
  });
  const since = Date.now() - 1000;
  await page.goto("/admin/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  const message = await latestEmail(email, since, /^Sign in to .* admin$/);
  const link = message.text.match(/https?:\/\/\S+\/api\/staff-auth\/callback\/resend\?\S+/)![0];
  await page.goto(link);
  await expect(page).toHaveURL(/\/admin\/verify/);
  await page.getByLabel("6-digit code").fill(generateTotp(TOTP_SECRET));
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.close();
  return context;
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

function luhnImei(): string {
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

let owner: BrowserContext;
let staff: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  // Two sign-ins plus up to 30 s waiting for a fresh TOTP step.
  test.setTimeout(120_000);
  owner = await staffSession(browser, OWNER);
  // Wait for the next TOTP step so the second sign-in isn't seen as a replay.
  await new Promise((r) => setTimeout(r, 30_000 - (Date.now() % 30_000) + 500));
  staff = await staffSession(browser, STAFF);
  page = await owner.newPage();
  page.on("dialog", (dialog) => void dialog.accept());
});

test.afterAll(async () => {
  await owner?.close();
  await staff?.close();
});

test("staff sign in with an ID and password, and still need two-step verification", async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: "en-GB", timezoneId: "Europe/London" });
  const signIn = await context.newPage();
  await signIn.setExtraHTTPHeaders({ "x-forwarded-for": "198.18.3.10" });
  await signIn.goto("/admin/sign-in");

  await signIn.getByLabel("Staff ID (work email)").fill("demo.password@example.co.uk");
  await signIn.getByLabel("Password", { exact: true }).fill("not the right password");
  await signIn.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    signIn.getByRole("alert").filter({ hasText: "That staff ID or password isn’t right." }),
  ).toBeVisible();
  await expect(signIn).toHaveURL(/\/admin\/sign-in/);

  await signIn.getByLabel("Staff ID (work email)").fill("demo.password@example.co.uk");
  await signIn.getByLabel("Password", { exact: true }).fill("demo password for tests");
  await signIn.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(signIn).toHaveURL(/\/admin\/verify/);

  // The password alone doesn't open the admin.
  await signIn.goto("/admin/orders");
  await expect(signIn).toHaveURL(/\/admin\/verify/);

  await signIn.getByLabel("6-digit code").fill(generateTotp(TOTP_SECRET));
  await signIn.getByRole("button", { name: "Verify code" }).click();
  await expect(signIn).toHaveURL(/\/admin\/orders$/);
  await context.close();
});

test("staff only see the sections their role allows, checked on the server", async () => {
  const staffPage = await staff.newPage();
  await staffPage.goto("/admin");
  const nav = staffPage.getByRole("navigation", { name: "Admin sections" });
  await expect(nav.getByRole("link", { name: "Trade-ins" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Device intake" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Prices" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Payouts" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Staff" })).toHaveCount(0);
  // Typing the URL doesn't help.
  await staffPage.goto("/admin/prices");
  await expect(staffPage).toHaveURL(/\/admin\?denied=/);
  await expect(staffPage.getByText("You don’t have permission to open that page.")).toBeVisible();
  // Nor does calling the export directly.
  const exportRes = await staffPage.request.get("/admin/prices/export", { maxRedirects: 0 });
  expect([302, 303, 307, 403]).toContain(exportRes.status());
  expect(exportRes.headers()["content-type"] ?? "").not.toContain("text/csv");
  await staffPage.close();
});

test("dashboard shows today's work, revenue and stock by store", async () => {
  await page.goto("/admin");
  for (const heading of [
    "Trade-ins",
    "Orders",
    "Payouts",
    "Revenue (after refunds)",
    "Stock by store",
  ]) {
    await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
  }
  await expect(page.getByRole("table", { name: "Stock by store" }).getByRole("row")).toHaveCount(4);
});

test("inspect a trade-in with photos and send a revised offer", async () => {
  await page.goto(`/admin/quotes?filter=awaiting&q=${SAM}`);
  await page.getByRole("table", { name: "Trade-ins" }).getByRole("link").first().click();
  await page.getByRole("button", { name: "Mark received" }).click();
  await expect(page.getByText("Marked as received.")).toBeVisible();

  const since = Date.now() - 1000;
  await page
    .getByLabel("Add photos")
    .setInputFiles({ name: "back.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("img", { name: /inspection photo 0/ })).toBeVisible();
  await page.getByLabel("Actual grade").selectOption("C");
  await page.getByLabel("Revised offer (£, optional)").fill("150");
  await page.getByLabel(/^Notes/).fill("Deep scratch on the back glass.");
  await page.getByRole("button", { name: "Save inspection" }).click();
  await expect(page.getByText("Revised offer sent to the customer.")).toBeVisible();
  await expect(page.getByText("Revised to £150.00 · customer: pending")).toBeVisible();
  const email = await latestEmail(SAM, since, /revised our offer/);
  expect(email.text).toContain("£150.00");
});

test("approve a trade-in, export the bank file and mark it paid", async () => {
  await page.goto(`/admin/quotes?filter=awaiting&q=${SAM}`);
  await page.getByRole("table", { name: "Trade-ins" }).getByRole("link").first().click();
  await page.getByRole("button", { name: "Save inspection" }).click();
  await expect(page.getByText("Approved: ready to pay.")).toBeVisible();

  await page.goto("/admin/payouts");
  await expect(page.getByRole("table", { name: "Payouts" })).toContainText("Sam Admin");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export bank file" }).click();
  const file = await download;
  const csv = readFileSync((await file.path())!, "utf8");
  expect(csv.split("\r\n")[0]).toBe("payee_name,sort_code,account_number,amount,reference");
  expect(csv).toContain("Sam Admin,11-22-33,11223344");

  const since = Date.now() - 1000;
  await page.getByRole("link", { name: "Sent to bank" }).click();
  await page.getByRole("checkbox", { name: "Select all" }).check();
  await page.getByRole("button", { name: /^Mark \d+ paid/ }).click();
  await expect(page.getByText(/payouts marked paid/)).toBeVisible();
  await latestEmail(SAM, since, /^We’ve paid you £/);
});

test("device intake: add a phone with photos and certificate, publish to the shop", async () => {
  await page.goto("/admin/intake");
  await page.getByLabel("IMEI").fill(luhnImei());
  await expect(page.getByText("New phone.")).toBeVisible();
  await page.getByLabel("Model").selectOption({ label: "Apple iPhone 13" });
  await page.getByLabel("Options").selectOption({ label: "128GB · Midnight" });
  await page.getByRole("radio", { name: "Grade A" }).check();
  await page.getByLabel("Battery health (%)").fill("91");
  await page.getByLabel("Price (£)").fill("279");
  await page.getByLabel("Store").selectOption({ label: "MetroTech, North Shields" });
  await page
    .getByLabel("Take or add photos")
    .setInputFiles({ name: "front.png", mimeType: "image/png", buffer: PNG });
  await page
    .getByLabel("Upload certificate")
    .setInputFiles({ name: "wipe.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByRole("link", { name: /wipe\.pdf/ })).toBeVisible();
  await page.getByRole("button", { name: "Publish to shop" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Published to the shop." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View in the shop" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Apple iPhone 13, 128GB, Midnight",
  );
  await expect(page.getByTestId("product-price")).toHaveText("£279.00");
});

test("catalogue: add a laptop model, stock it and find it in its shop category", async () => {
  await page.goto("/admin/catalogue");
  await page.getByLabel("New brand").fill("Lenovo");
  await page.getByRole("button", { name: "Add brand" }).click();
  await expect(page.getByText("Lenovo added.")).toBeVisible();

  const form = page.locator("section").filter({
    has: page.getByRole("heading", { level: 2, name: "Add a model" }),
  });
  await form.getByLabel("Category", { exact: true }).selectOption({ label: "Laptops" });
  await form.getByLabel("Brand").selectOption({ label: "Lenovo" });
  await form.getByLabel("Model name").fill("ThinkPad T14");
  await form.getByLabel("Release year").fill("2023");
  await form.getByLabel("Storage sizes").fill("256GB, 512GB");
  await form.getByLabel("Colours").fill("Storm Grey");
  await form.getByLabel("Other specifications (optional)").fill("16GB RAM Intel Core i7");
  await form.getByRole("button", { name: "Add model" }).click();
  await expect(page.getByText("ThinkPad T14 added with 2 options.")).toBeVisible();

  await page.goto("/admin/intake");
  await page.getByLabel("Category").selectOption({ label: "Laptops" });
  await expect(page.getByLabel("IMEI")).toHaveCount(0);
  await page.getByLabel("Serial number").fill("pf-3x9k2l");
  await page.getByLabel("Model").selectOption({ label: "Lenovo ThinkPad T14" });
  await page
    .getByLabel("Options")
    .selectOption({ label: "256GB · 16GB RAM Intel Core i7 · Storm Grey" });
  await page.getByRole("radio", { name: "Grade A" }).check();
  await page.getByLabel("Battery health (%)").fill("88");
  await page.getByLabel("Price (£)").fill("449");
  await page.getByLabel("Store").selectOption({ label: "MetroTech, North Shields" });
  await page
    .getByLabel("Take or add photos")
    .setInputFiles({ name: "laptop.png", mimeType: "image/png", buffer: PNG });
  await page
    .getByLabel("Upload certificate")
    .setInputFiles({ name: "laptop-wipe.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByRole("link", { name: /laptop-wipe\.pdf/ })).toBeVisible();
  await page.getByRole("button", { name: "Publish to shop" }).click();
  await page.getByRole("link", { name: "View in the shop" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Lenovo ThinkPad T14, 256GB, 16GB RAM Intel Core i7, Storm Grey",
  );
  await expect(page.getByTestId("product-price")).toHaveText("£449.00");
  await expect(page.getByRole("button", { name: "View in 3D" })).toHaveCount(0);

  // The listing refreshes in the background after a change.
  await expect(async () => {
    await page.goto("/shop/category/laptops");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Refurbished laptops");
    await expect(page.getByRole("link", { name: "Lenovo ThinkPad T14" })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 45_000 });

  // Laptops are for sale only: no trade-in page.
  const sell = await page.goto("/sell/lenovo");
  expect(sell?.status()).toBe(404);
});

test("orders: dispatch with tracking, refund part, mark delivered", async () => {
  await page.goto("/admin/orders?q=RU-900010");
  await page.getByRole("link", { name: "RU-900010" }).click();
  const since = Date.now() - 1000;
  await page.getByLabel("Tracking number").fill("ab999999999gb");
  await page.getByRole("button", { name: "Mark dispatched" }).click();
  await expect(
    page.getByText("Dispatched. The customer has been emailed the tracking."),
  ).toBeVisible();
  await expect(page.getByText("Royal Mail AB999999999GB")).toBeVisible();
  await latestEmail(SAM, since, /is on its way$/);

  await page.getByLabel("Amount (£)").fill("10");
  await page.getByLabel("Reason").fill("Small scuff not in photos");
  await page.getByRole("button", { name: "Refund" }).click();
  await expect(page.getByText(/Refund of £10\.00 sent to Stripe/)).toBeVisible();

  await page.getByRole("button", { name: "Mark delivered" }).click();
  await expect(page.getByText("Marked delivered.")).toBeVisible();
});

test("returns: approve, then complete", async () => {
  await page.goto("/admin/returns");
  const card = page.getByRole("listitem").filter({ hasText: "RU-R-DEMO10" });
  await card.getByLabel("Note to the customer (optional)").fill("We’ve emailed a returns label.");
  await card.getByRole("button", { name: "Approve RU-R-DEMO10" }).click();
  await expect(
    page.getByText("RU-R-DEMO10 approved. The customer has been emailed."),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("listitem")
    .filter({ hasText: "RU-R-DEMO10" })
    .getByRole("button", { name: "Complete RU-R-DEMO10" })
    .click();
  await expect(page.getByText("RU-R-DEMO10 completed.", { exact: false })).toBeVisible();
});

test("prices: edit in the table, import a CSV, see the history", async () => {
  await page.goto("/admin/prices?model=pixel-8a");
  const cell = page.getByRole("spinbutton", { name: /^128GB Obsidian, Grade A$/ });
  const before = Number(await cell.inputValue());
  await cell.fill((before + 5).toFixed(2));
  await page.getByRole("button", { name: "Save 1 change" }).click();
  await expect(page.getByText("1 price saved.")).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Recent price changes" }).getByRole("row").nth(1),
  ).toContainText("Pixel 8a, 128GB, Obsidian · Grade A");

  const csv = await (await page.request.get("/admin/prices/export?model=pixel-8a")).text();
  const lines = csv.trim().split("\r\n");
  const cells = lines[1]!.split(",");
  cells[6] = (Number(cells[6]) + 1).toFixed(2); // grade_b
  lines[1] = cells.join(",");
  await page.getByLabel("Price CSV").setInputFiles({
    name: "prices.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(lines.join("\r\n")),
  });
  await expect(page.getByText(/^1 changes, \d+ unchanged\.$/)).toBeVisible();
  await page.getByRole("button", { name: "Import 1 changes" }).click();
  await expect(page.getByText("1 prices imported.")).toBeVisible();
});

test("stores: change opening hours", async () => {
  await page.goto("/admin/stores");
  await page.getByRole("link", { name: "Edit FairTech, South Shields" }).click();
  const saturday = page.getByText("Saturday", { exact: true }).locator("..");
  await saturday.getByLabel("Opens").fill("10:00");
  await saturday.getByLabel("Closes").fill("16:00");
  await page.getByRole("button", { name: "Save store" }).click();
  await expect(page.getByText("Store saved.", { exact: false })).toBeVisible();
  await page.goto("/admin/stores");
  await expect(
    page.getByRole("listitem").filter({ hasText: "FairTech, South Shields" }),
  ).toContainText("Sat 10am–4pm");
});

test("customers, audit log and content", async () => {
  await page.goto(`/admin/customers?q=${SAM}`);
  await page.getByRole("link", { name: "Sam Admin" }).click();
  await expect(page.getByRole("heading", { name: "Trade-ins (3)" })).toBeVisible();

  await page.goto("/admin/audit?action=quote.");
  await expect(page.getByRole("table", { name: "Audit log" })).toContainText("quote.inspected");

  await page.goto("/admin/content");
  await expect(page.getByText("Sanity Studio isn’t connected yet.")).toBeVisible();
});

test("works on a phone: section bar instead of the sidebar", async () => {
  const phone = await owner.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto("/admin/quotes");
  const bar = phone.getByRole("navigation", { name: "Admin sections" });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("link", { name: "Trade-ins" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const width = await phone.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await phone.close();
});

test("admin pages have no WCAG 2.2 AA violations (desktop and phone)", async () => {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const path of [
      "/admin",
      "/admin/quotes",
      "/admin/intake",
      "/admin/catalogue",
      "/admin/prices",
      "/admin/payouts",
      "/admin/orders",
    ]) {
      await page.goto(path);
      await expect(page.locator("[data-slot='skeleton']")).toHaveCount(0, { timeout: 30_000 });
      const scan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        scan.violations.map((v) => `${viewport.width} ${path} ${v.id}: ${v.nodes[0]?.target}`),
      ).toEqual([]);
    }
  }
});
