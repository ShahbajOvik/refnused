import { createHash, randomBytes } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { deviceModels, modelVariants, products, stockAlerts } from "@/db/schema";
import type { AppDb } from "@/db/types";

/*
 * "Notify me" alerts from sold units' pages. Signing up twice for the same
 * thing is harmless: the existing alert is kept and nothing new is sent.
 */

export const stockAlertSchema = z.object({
  productId: z.uuid(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address, like name@example.co.uk").max(254)),
  /** "model": any storage. "storage": the same storage size as this unit. */
  scope: z.enum(["model", "storage"]),
  consent: z.literal(true, "Tick the box so we can email you"),
});

export type StockAlertInput = z.infer<typeof stockAlertSchema>;

export function hashAlertToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type CreateStockAlertResult =
  | {
      ok: true;
      /** True for a new alert; false when an identical one was already active. */
      created: boolean;
      /** Raw unsubscribe token (new alerts only). Only its hash is stored. */
      unsubscribeToken?: string;
      modelName: string;
      storageGb: number | null;
    }
  | { ok: false; reason: "unknown_product" };

export async function createStockAlert(
  db: AppDb,
  input: StockAlertInput & { customerId?: string | null },
  options: { now?: Date } = {},
): Promise<CreateStockAlertResult> {
  const [product] = await db
    .select({
      id: products.id,
      modelId: deviceModels.id,
      modelName: deviceModels.name,
      storageGb: modelVariants.storageGb,
    })
    .from(products)
    .innerJoin(modelVariants, eq(products.variantId, modelVariants.id))
    .innerJoin(deviceModels, eq(modelVariants.modelId, deviceModels.id))
    .where(
      and(
        eq(products.id, input.productId),
        inArray(products.status, ["listed", "reserved", "sold"]),
      ),
    )
    .limit(1);
  if (!product) return { ok: false, reason: "unknown_product" };

  const storageGb = input.scope === "storage" ? product.storageGb : null;
  const token = randomBytes(24).toString("base64url");
  const inserted = await db
    .insert(stockAlerts)
    .values({
      email: input.email,
      customerId: input.customerId ?? null,
      modelId: product.modelId,
      storageGb,
      sourceProductId: product.id,
      unsubscribeTokenHash: hashAlertToken(token),
      consentedAt: options.now ?? new Date(),
    })
    // stock_alerts_active_unique: an active alert for the same email, model
    // and storage already exists. (Drizzle can't target expression indexes.)
    .onConflictDoNothing()
    .returning({ id: stockAlerts.id });

  const created = inserted.length > 0;
  return {
    ok: true,
    created,
    unsubscribeToken: created ? token : undefined,
    modelName: product.modelName,
    storageGb,
  };
}

/** Turns an alert off. True if an active alert matched the token. */
export async function unsubscribeStockAlert(db: AppDb, token: string): Promise<boolean> {
  if (!/^[\w-]{20,64}$/.test(token)) return false;
  const rows = await db
    .update(stockAlerts)
    .set({ isActive: false })
    .where(
      and(
        eq(stockAlerts.unsubscribeTokenHash, hashAlertToken(token)),
        eq(stockAlerts.isActive, true),
      ),
    )
    .returning({ id: stockAlerts.id });
  return rows.length > 0;
}

/** The alert behind an unsubscribe link, for the confirmation page. */
export async function getStockAlertByToken(db: AppDb, token: string) {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  const [row] = await db
    .select({
      isActive: stockAlerts.isActive,
      modelName: deviceModels.name,
      storageGb: stockAlerts.storageGb,
    })
    .from(stockAlerts)
    .innerJoin(deviceModels, eq(stockAlerts.modelId, deviceModels.id))
    .where(eq(stockAlerts.unsubscribeTokenHash, hashAlertToken(token)))
    .limit(1);
  return row ?? null;
}

export function stockAlertConfirmationEmail(input: {
  modelName: string;
  storageGb: number | null;
  unsubscribeUrl: string;
  shopUrl: string;
}) {
  const what = input.storageGb ? `${input.modelName} ${input.storageGb}GB` : input.modelName;
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
    );
  const subject = `We’ll tell you when a ${what} is in stock`;
  const text = [
    `Thanks. We’ll email you when a refurbished ${what} is back in stock at RefurbednUsed.`,
    "",
    `Browse what’s in stock now: ${input.shopUrl}`,
    "",
    `Don’t want this alert any more? ${input.unsubscribeUrl}`,
  ].join("\n");
  const html = `<p>Thanks. We’ll email you when a refurbished <strong>${escape(what)}</strong> is back in stock at RefurbednUsed.</p>
<p><a href="${escape(input.shopUrl)}">Browse what’s in stock now</a></p>
<p style="color:#666;font-size:13px">Don’t want this alert any more? <a href="${escape(input.unsubscribeUrl)}">Stop these emails</a>.</p>`;
  return { subject, text, html };
}
