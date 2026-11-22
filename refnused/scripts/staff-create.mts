/**
 * Creates a staff account. Use it for the first owner; after that, owners
 * add staff from /admin/staff.
 *
 *   npm run staff:create -- --email jo@example.co.uk --name "Jo Bloggs" --role owner
 */
import { parseArgs } from "node:util";

import { STAFF_ROLES } from "@/auth/roles";
import { createStaff, StaffAdminError } from "@/auth/staff-admin";
import { createDatabase } from "@refnused/database/db/client";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string", default: "staff" },
  },
});

if (!values.email || !values.name) {
  console.error(
    `Usage: npm run staff:create -- --email <email> --name "<name>" --role <${STAFF_ROLES.join("|")}>`,
  );
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const { db, close } = createDatabase(process.env.DATABASE_URL, { max: 1 });
try {
  const created = await createStaff(
    db,
    { email: values.email, name: values.name, role: values.role as (typeof STAFF_ROLES)[number] },
    { type: "system" },
  );
  console.log(`Created ${values.role} ${values.email} (${created.id}).`);
  console.log(
    "They can now sign in at /admin/sign-in and will be asked to set up two-step verification.",
  );
} catch (error) {
  if (error instanceof StaffAdminError) console.error(error.message);
  else if (error instanceof Error && error.name === "ZodError")
    console.error(`Invalid input: ${error.message}`);
  else console.error(error);
  process.exitCode = 1;
} finally {
  await close();
}
