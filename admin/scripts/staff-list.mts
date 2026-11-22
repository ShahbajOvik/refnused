/**
 * Lists staff accounts: email, role, whether they're active and whether
 * they have a password. Never prints passwords or hashes.
 *
 *   npm run staff:list
 */
import { createDatabase } from "@refnused/database/db/client";

import { listStaff } from "@/auth/staff-admin";
import { staffHasPassword } from "@/auth/staff-password";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const { db, close } = createDatabase(process.env.DATABASE_URL, { max: 1 });
try {
  const staff = await listStaff(db);
  if (staff.length === 0) {
    console.log("No staff accounts yet. Create the first owner with npm run db:seed:owner.");
  } else {
    const rows = await Promise.all(
      staff.map(async (s) => ({
        email: s.email,
        name: s.name,
        role: s.role,
        active: s.isActive ? "yes" : "no",
        password: (await staffHasPassword(db, s.id)) ? "set" : "none",
      })),
    );
    console.table(rows);
  }
} finally {
  await close();
}
