import { and, count, eq } from "drizzle-orm";

import { customerPayoutAccounts, payouts } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { recordAudit, type RequestMeta } from "@/lib/audit";
import { encryptBankDetails, type BankDetailsInput } from "@/lib/crypto/bank-details";
import type { FieldCipher } from "@/lib/crypto/field-encryption";

import { verifyCode, type CodeCheck } from "./verification";

/*
 * The bank account trade-ins are paid to. Shown masked only ("sort code
 * ••-••-56, account ending 1234"); changing it needs a fresh emailed code.
 * Encrypted with the same contexts as payouts, so the ciphertext can be
 * copied to pending payouts without decrypting it.
 */

export type PayoutSummary = {
  sortCodeLast2: string;
  accountNumberLast4: string;
  verifiedAt: Date;
} | null;

export async function getPayoutSummary(db: AppDb, customerId: string) {
  const [account] = await db
    .select({
      sortCodeLast2: customerPayoutAccounts.sortCodeLast2,
      accountNumberLast4: customerPayoutAccounts.accountNumberLast4,
      verifiedAt: customerPayoutAccounts.verifiedAt,
    })
    .from(customerPayoutAccounts)
    .where(eq(customerPayoutAccounts.customerId, customerId));
  const [{ value: pendingPayouts } = { value: 0 }] = await db
    .select({ value: count() })
    .from(payouts)
    .where(
      and(
        eq(payouts.customerId, customerId),
        eq(payouts.status, "pending"),
        eq(payouts.method, "bank_transfer"),
      ),
    );
  return { account: (account ?? null) as PayoutSummary, pendingPayouts };
}

export function maskSortCode(last2: string) {
  return `••-••-${last2}`;
}

export type ChangePayoutResult =
  { ok: true; appliedToPayouts: number } | { ok: false; reason: Exclude<CodeCheck, "ok"> };

/** Saves new payout details after checking the emailed code. */
export async function changePayoutDetails(
  db: AppDb,
  input: {
    customerId: string;
    code: string;
    details: BankDetailsInput;
    /** Also pay open trade-ins (pending payouts) to the new account. */
    applyToPending: boolean;
  },
  options: { cipher: FieldCipher; now?: Date; meta?: RequestMeta },
): Promise<ChangePayoutResult> {
  const now = options.now ?? new Date();
  const check = await verifyCode(db, input.customerId, "payout_change", input.code, now);
  if (check !== "ok") return { ok: false, reason: check };

  const encrypted = encryptBankDetails(input.details, options.cipher);
  const sortCodeLast2 = input.details.sortCode.replace(/\D/g, "").slice(-2);

  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const [before] = await tx
      .select({ last4: customerPayoutAccounts.accountNumberLast4 })
      .from(customerPayoutAccounts)
      .where(eq(customerPayoutAccounts.customerId, input.customerId));
    await tx
      .insert(customerPayoutAccounts)
      .values({ customerId: input.customerId, ...encrypted, sortCodeLast2, verifiedAt: now })
      .onConflictDoUpdate({
        target: customerPayoutAccounts.customerId,
        set: { ...encrypted, sortCodeLast2, verifiedAt: now },
      });
    let applied = 0;
    if (input.applyToPending) {
      const rows = await tx
        .update(payouts)
        .set(encrypted)
        .where(
          and(
            eq(payouts.customerId, input.customerId),
            eq(payouts.status, "pending"),
            eq(payouts.method, "bank_transfer"),
          ),
        )
        .returning({ id: payouts.id });
      applied = rows.length;
    }
    // Only the last 4 digits ever go in the audit log.
    await recordAudit(
      tx,
      {
        actorType: "customer",
        actorId: input.customerId,
        action: "customer.payout_details_changed",
        entityType: "customer",
        entityId: input.customerId,
        changes: {
          before: { accountNumberLast4: before?.last4 ?? null },
          after: { accountNumberLast4: encrypted.accountNumberLast4, appliedToPayouts: applied },
        },
      },
      options.meta,
    );
    return { ok: true, appliedToPayouts: applied } as const;
  });
}

export function payoutChangedEmail(input: { last4: string }) {
  const subject = "Your payout bank details were changed";
  const text = [
    `The bank account we pay your trade-ins to was changed to the account ending ${input.last4}.`,
    "",
    "If this wasn’t you, contact us straight away and we’ll hold any payments.",
  ].join("\n");
  const html = `<p>The bank account we pay your trade-ins to was changed to the account ending <strong>${input.last4}</strong>.</p><p>If this wasn’t you, contact us straight away and we’ll hold any payments.</p>`;
  return { subject, text, html };
}
