import { and, asc, count, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { customerAddresses } from "@refnused/database/db/schema";
import type { AppDb } from "@refnused/database/db/types";
import { ukPostcodeSchema } from "@refnused/database/lib/validation/uk";

export const MAX_ADDRESSES = 10;

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

export const addressInputSchema = z.object({
  label: optional(30),
  name: z.string().trim().min(1, "Enter the name for deliveries").max(100),
  line1: z.string().trim().min(1, "Enter the first line of the address").max(100),
  line2: optional(100),
  town: z.string().trim().min(1, "Enter the town or city").max(60),
  county: optional(60),
  postcode: ukPostcodeSchema,
  isDefault: z.boolean().default(false),
});

export type AddressInput = z.input<typeof addressInputSchema>;
export type SavedAddress = typeof customerAddresses.$inferSelect;

export async function listAddresses(db: AppDb, customerId: string): Promise<SavedAddress[]> {
  return db
    .select()
    .from(customerAddresses)
    .where(eq(customerAddresses.customerId, customerId))
    .orderBy(desc(customerAddresses.isDefault), asc(customerAddresses.createdAt));
}

export type SaveAddressResult =
  { ok: true; id: string } | { ok: false; reason: "not_found" | "limit" };

/** Adds (no id) or updates (id) an address. The first address becomes the default. */
export async function saveAddress(
  db: AppDb,
  customerId: string,
  input: z.output<typeof addressInputSchema>,
  id?: string,
): Promise<SaveAddressResult> {
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const [{ value: existing } = { value: 0 }] = await tx
      .select({ value: count() })
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, customerId));
    if (!id && existing >= MAX_ADDRESSES) return { ok: false, reason: "limit" } as const;
    const makeDefault = input.isDefault || existing === 0;
    if (makeDefault) {
      await tx
        .update(customerAddresses)
        .set({ isDefault: false })
        .where(
          and(eq(customerAddresses.customerId, customerId), eq(customerAddresses.isDefault, true)),
        );
    }
    const values = { ...input, isDefault: makeDefault };
    if (id) {
      const [row] = await tx
        .update(customerAddresses)
        .set(values)
        .where(and(eq(customerAddresses.id, id), eq(customerAddresses.customerId, customerId)))
        .returning({ id: customerAddresses.id });
      return row
        ? ({ ok: true, id: row.id } as const)
        : ({ ok: false, reason: "not_found" } as const);
    }
    const [row] = await tx
      .insert(customerAddresses)
      .values({ ...values, customerId })
      .returning({ id: customerAddresses.id });
    return { ok: true, id: row!.id } as const;
  });
}

export async function deleteAddress(db: AppDb, customerId: string, id: string) {
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const [removed] = await tx
      .delete(customerAddresses)
      .where(and(eq(customerAddresses.id, id), eq(customerAddresses.customerId, customerId)))
      .returning({ isDefault: customerAddresses.isDefault });
    if (removed?.isDefault) {
      // Promote the oldest remaining address.
      const [next] = await tx
        .select({ id: customerAddresses.id })
        .from(customerAddresses)
        .where(eq(customerAddresses.customerId, customerId))
        .orderBy(asc(customerAddresses.createdAt))
        .limit(1);
      if (next) {
        await tx
          .update(customerAddresses)
          .set({ isDefault: true })
          .where(eq(customerAddresses.id, next.id));
      }
    }
    return Boolean(removed);
  });
}

export async function setDefaultAddress(db: AppDb, customerId: string, id: string) {
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const [target] = await tx
      .select({ id: customerAddresses.id })
      .from(customerAddresses)
      .where(and(eq(customerAddresses.id, id), eq(customerAddresses.customerId, customerId)));
    if (!target) return false;
    await tx
      .update(customerAddresses)
      .set({ isDefault: false })
      .where(
        and(eq(customerAddresses.customerId, customerId), eq(customerAddresses.isDefault, true)),
      );
    await tx.update(customerAddresses).set({ isDefault: true }).where(eq(customerAddresses.id, id));
    return true;
  });
}
