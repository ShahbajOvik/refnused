import "server-only";

import { eq } from "drizzle-orm";

import { customerAuth } from "@/auth/customer";
import { db } from "@refnused/database/db";
import { customers } from "@refnused/database/db/schema";

/** The signed-in customer for server actions, or null (actions then refuse). */
export async function currentCustomer(): Promise<{
  id: string;
  email: string;
  name: string | null;
} | null> {
  const session = await customerAuth();
  const id = session?.user?.id;
  if (!id) return null;
  const [row] = await db
    .select({
      id: customers.id,
      email: customers.email,
      name: customers.name,
      deletedAt: customers.deletedAt,
    })
    .from(customers)
    .where(eq(customers.id, id));
  if (!row || row.deletedAt) return null;
  return { id: row.id, email: row.email, name: row.name };
}
