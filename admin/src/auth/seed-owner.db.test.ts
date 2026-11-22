// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { verifyPassword } from "@refnused/database/auth/password";
import { auditLog, staffUsers } from "@refnused/database/db/schema";
import type { AppDb } from "@refnused/database/db/types";
import { createTestDb } from "@refnused/database/test/db";

import { seedOwner } from "./seed-owner";
import { createStaff } from "./staff-admin";

let db: AppDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 180_000);
afterAll(() => close?.());

const PASSWORD = "correct-horse-battery";

async function staff(email: string) {
  const [row] = await db.select().from(staffUsers).where(eq(staffUsers.email, email));
  return row!;
}

// Password hashing is deliberately slow; allow for a busy machine.
describe("seedOwner", { timeout: 30_000 }, () => {
  it("creates an active owner with a password, audited", async () => {
    const result = await seedOwner(db, {
      email: " Owner@Example.co.uk ",
      name: "Jo Owner",
      password: PASSWORD,
    });
    expect(result).toMatchObject({
      created: true,
      passwordSet: true,
      hasPassword: true,
      notOwner: false,
    });

    const row = await staff("owner@example.co.uk");
    expect(row.role).toBe("owner");
    expect(row.isActive).toBe(true);
    expect(await verifyPassword(PASSWORD, row.passwordHash!)).toBe(true);

    const actions = (await db.select().from(auditLog).where(eq(auditLog.entityId, result.id))).map(
      (e) => e.action,
    );
    expect(actions).toEqual(expect.arrayContaining(["staff.create", "staff.password_set"]));
  });

  it("is safe to re-run: never changes the account or its password", async () => {
    const before = await staff("owner@example.co.uk");
    const result = await seedOwner(db, {
      email: "owner@example.co.uk",
      name: "Someone Else",
      password: "a-different-password",
    });
    expect(result).toMatchObject({
      id: before.id,
      created: false,
      passwordSet: false,
      hasPassword: true,
    });
    const after = await staff("owner@example.co.uk");
    expect(after.name).toBe("Jo Owner");
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it("creates without a password, and adds one on a later run", async () => {
    const first = await seedOwner(db, { email: "nopass@example.co.uk", name: "No Pass" });
    expect(first).toMatchObject({ created: true, passwordSet: false, hasPassword: false });
    expect((await staff("nopass@example.co.uk")).passwordHash).toBeNull();

    const second = await seedOwner(db, {
      email: "nopass@example.co.uk",
      name: "No Pass",
      password: PASSWORD,
    });
    expect(second).toMatchObject({ created: false, passwordSet: true });
  });

  it("leaves an existing non-owner alone and says so", async () => {
    await createStaff(
      db,
      { email: "clerk@example.co.uk", name: "Clerk", role: "staff" },
      { type: "system" },
    );
    const result = await seedOwner(db, { email: "clerk@example.co.uk", name: "Clerk" });
    expect(result).toMatchObject({ created: false, notOwner: true });
    expect((await staff("clerk@example.co.uk")).role).toBe("staff");
  });

  it("rejects a bad email or a short password before writing anything", async () => {
    await expect(seedOwner(db, { email: "not-an-email", name: "X" })).rejects.toThrow();
    await expect(
      seedOwner(db, { email: "short@example.co.uk", name: "X", password: "short" }),
    ).rejects.toThrow();
    expect(
      await db.select().from(staffUsers).where(eq(staffUsers.email, "short@example.co.uk")),
    ).toHaveLength(0);
  });
});
