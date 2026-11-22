import { eq } from "drizzle-orm";
import { z } from "zod";

import { newPasswordSchema } from "@refnused/database/auth/password";
import { staffUsers } from "@refnused/database/db/schema";
import type { AppDb } from "@refnused/database/db/types";

import { createStaff } from "./staff-admin";
import { setStaffPasswordByEmail, staffHasPassword } from "./staff-password";

/** OWNER_* values for `npm run db:seed:owner`. The password is optional. */
export const ownerSeedSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  name: z.string().trim().min(1).max(120),
  password: newPasswordSchema.optional(),
});

export type OwnerSeedResult = {
  id: string;
  created: boolean;
  passwordSet: boolean;
  /** Whether the account has a password after seeding. */
  hasPassword: boolean;
  /** An account with that email exists but isn't an active owner (left as is). */
  notOwner: boolean;
};

/**
 * Creates the first owner account. Safe to re-run: an existing account is
 * never changed (role, name or password), and a password is only set when
 * the account has none yet. Both steps write audit_log entries
 * (staff.create, staff.password_set) via the usual staff services.
 */
export async function seedOwner(
  db: AppDb,
  input: z.input<typeof ownerSeedSchema>,
): Promise<OwnerSeedResult> {
  const data = ownerSeedSchema.parse(input);
  const [existing] = await db
    .select({ id: staffUsers.id, role: staffUsers.role, isActive: staffUsers.isActive })
    .from(staffUsers)
    .where(eq(staffUsers.email, data.email));

  const id = existing
    ? existing.id
    : (
        await createStaff(
          db,
          { email: data.email, name: data.name, role: "owner" },
          { type: "system" },
        )
      ).id;

  let passwordSet = false;
  const hadPassword = await staffHasPassword(db, id);
  if (data.password && !hadPassword) {
    await setStaffPasswordByEmail(db, { email: data.email, password: data.password });
    passwordSet = true;
  }

  return {
    id,
    created: !existing,
    passwordSet,
    hasPassword: hadPassword || passwordSet,
    notOwner: !!existing && (existing.role !== "owner" || !existing.isActive),
  };
}
