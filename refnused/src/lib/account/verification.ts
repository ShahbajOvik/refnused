import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { and, desc, eq, isNull } from "drizzle-orm";

import { customerVerificationCodes } from "@refnused/database/db/schema";
import type { AppDb } from "@refnused/database/db/types";

/*
 * Emailed one-time codes that confirm sensitive changes (payout details,
 * deleting the account), on top of being signed in. Only a hash is stored.
 */

export const CODE_TTL_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;

export type VerificationPurpose = "payout_change" | "delete_account";

function hashCode(customerId: string, purpose: VerificationPurpose, code: string) {
  return createHash("sha256").update(`${customerId}:${purpose}:${code}`).digest("hex");
}

/** Creates a fresh 6-digit code (earlier unused ones stop working). */
export async function issueVerificationCode(
  db: AppDb,
  customerId: string,
  purpose: VerificationPurpose,
  now: Date = new Date(),
): Promise<{ code: string; expiresAt: Date }> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(now.getTime() + CODE_TTL_MINUTES * 60_000);
  await db
    .update(customerVerificationCodes)
    .set({ consumedAt: now })
    .where(
      and(
        eq(customerVerificationCodes.customerId, customerId),
        eq(customerVerificationCodes.purpose, purpose),
        isNull(customerVerificationCodes.consumedAt),
      ),
    );
  await db.insert(customerVerificationCodes).values({
    customerId,
    purpose,
    codeHash: hashCode(customerId, purpose, code),
    expiresAt,
  });
  return { code, expiresAt };
}

export type CodeCheck = "ok" | "invalid" | "expired" | "too_many_attempts";

/** Checks and uses up a code. Wrong guesses count towards a small limit. */
export async function verifyCode(
  db: AppDb,
  customerId: string,
  purpose: VerificationPurpose,
  code: string,
  now: Date = new Date(),
): Promise<CodeCheck> {
  const normalised = code.replace(/\s/g, "");
  const [row] = await db
    .select()
    .from(customerVerificationCodes)
    .where(
      and(
        eq(customerVerificationCodes.customerId, customerId),
        eq(customerVerificationCodes.purpose, purpose),
        isNull(customerVerificationCodes.consumedAt),
      ),
    )
    .orderBy(desc(customerVerificationCodes.createdAt))
    .limit(1);
  if (!row) return "invalid";
  if (row.expiresAt <= now) return "expired";
  if (row.attempts >= MAX_CODE_ATTEMPTS) return "too_many_attempts";

  const expected = Buffer.from(row.codeHash, "hex");
  const actual = Buffer.from(hashCode(customerId, purpose, normalised), "hex");
  if (!/^\d{6}$/.test(normalised) || !timingSafeEqual(expected, actual)) {
    await db
      .update(customerVerificationCodes)
      .set({ attempts: row.attempts + 1 })
      .where(eq(customerVerificationCodes.id, row.id));
    return row.attempts + 1 >= MAX_CODE_ATTEMPTS ? "too_many_attempts" : "invalid";
  }
  await db
    .update(customerVerificationCodes)
    .set({ consumedAt: now })
    .where(eq(customerVerificationCodes.id, row.id));
  return "ok";
}

export function verificationCodeEmail(input: {
  code: string;
  purpose: VerificationPurpose;
  minutes: number;
}) {
  const what =
    input.purpose === "payout_change" ? "change your payout bank details" : "delete your account";
  const subject = `Your RefurbednUsed code: ${input.code}`;
  const text = [
    `Your code to ${what} is ${input.code}.`,
    "",
    `It expires in ${input.minutes} minutes. If you didn’t ask for this, ignore this email and consider signing out of other devices. Never share this code.`,
  ].join("\n");
  const html = `<p>Your code to ${what} is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${input.code}</p><p>It expires in ${input.minutes} minutes. If you didn’t ask for this, ignore this email. Never share this code.</p>`;
  return { subject, text, html };
}
