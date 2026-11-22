// @vitest-environment node
import { randomBytes } from "node:crypto";

import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { checkCustomerSignIn, logSignIn } from "@/auth/sign-in-rules";
import { auditLog, customers } from "@refnused/database/db/schema";
import type { AppDb } from "@refnused/database/db/types";
import { createTestDb } from "@refnused/database/test/db";

let db: AppDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close?.());

const uniqueEmail = (name: string) => `${name}-${randomBytes(3).toString("hex")}@example.co.uk`;

async function auditActions(entityId: string) {
  const rows = await db
    .select({ action: auditLog.action })
    .from(auditLog)
    .where(eq(auditLog.entityId, entityId))
    .orderBy(desc(auditLog.id));
  return rows.map((r) => r.action);
}

describe("customer sign-in rules", () => {
  it("lets new and existing customers in", async () => {
    expect(await checkCustomerSignIn(db, { email: uniqueEmail("new"), provider: "resend" })).toBe(
      true,
    );
  });

  it("blocks erased (deleted) customers", async () => {
    const email = uniqueEmail("erased");
    await db.insert(customers).values({ email, deletedAt: new Date() });
    expect(await checkCustomerSignIn(db, { email, provider: "resend" })).toBe(false);
  });

  it("blocks Google accounts with unverified email", async () => {
    expect(
      await checkCustomerSignIn(db, {
        email: uniqueEmail("g"),
        provider: "google",
        emailVerified: false,
      }),
    ).toBe(false);
  });

  it("logs customer sign-ins", async () => {
    const [customer] = await db
      .insert(customers)
      .values({ email: uniqueEmail("c") })
      .returning();
    await logSignIn(db, { area: "customer", userId: customer!.id, provider: "passkey" });
    expect(await auditActions(customer!.id)).toContain("auth.sign_in");
  });
});
