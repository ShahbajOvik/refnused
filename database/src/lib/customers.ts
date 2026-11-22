import { eq } from "drizzle-orm";

import { customers } from "../db/schema";
import type { AppDb } from "../db/types";

/** Finds a customer by email (case-insensitive) or creates one; fills in a missing name/phone. */
export async function findOrCreateCustomer(
  db: AppDb,
  input: { email: string; name?: string | null; phone?: string | null },
): Promise<{ id: string }> {
  const email = input.email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: customers.id, name: customers.name, phone: customers.phone })
    .from(customers)
    // The column's collation is case-insensitive (and indexed).
    .where(eq(customers.email, email));
  if (!existing) {
    const [created] = await db
      .insert(customers)
      .values({ email, name: input.name ?? null, phone: input.phone ?? null })
      .$returningId();
    return { id: created!.id };
  }
  if ((!existing.name && input.name) || (!existing.phone && input.phone)) {
    await db
      .update(customers)
      .set({ name: existing.name ?? input.name, phone: existing.phone ?? input.phone })
      .where(eq(customers.id, existing.id));
  }
  return { id: existing.id };
}
