import { randomBytes } from "node:crypto";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { payouts, quotes } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { ActionError } from "@/lib/action-error";
import { recordAudit, type RequestMeta } from "@/lib/audit";
import { decryptBankDetails } from "@/lib/crypto/bank-details";
import type { FieldCipher } from "@/lib/crypto/field-encryption";
import { toCsv } from "@/lib/csv";

/*
 * Trade-in payouts. A payout is ready when its quote is approved. Staff
 * export ready payouts as a bank payment file (status → processing), pay
 * them in online banking, then mark them paid.
 *
 * The export is the only place bank details are decrypted. The audit log
 * records which payouts were exported, never the details.
 */

export type PayoutFilter = "ready" | "processing" | "paid" | "other";

export type PayoutRow = {
  id: string;
  quoteId: string;
  quoteReference: string;
  quoteStatus: string;
  customerName: string | null;
  amountPence: number;
  method: string;
  status: string;
  accountNumberLast4: string | null;
  exportedAt: Date | null;
  exportBatchId: string | null;
  paidAt: Date | null;
  failureReason: string | null;
};

function filterCondition(filter: PayoutFilter) {
  switch (filter) {
    case "ready":
      return and(eq(payouts.status, "pending"), eq(quotes.status, "approved"));
    case "processing":
      return eq(payouts.status, "processing");
    case "paid":
      return eq(payouts.status, "paid");
    case "other":
      return inArray(payouts.status, ["failed", "cancelled"]);
  }
}

export async function listPayouts(db: AppDb, filter: PayoutFilter): Promise<PayoutRow[]> {
  return db
    .select({
      id: payouts.id,
      quoteId: quotes.id,
      quoteReference: quotes.reference,
      quoteStatus: quotes.status,
      customerName: quotes.contactName,
      amountPence: payouts.amountPence,
      method: payouts.method,
      status: payouts.status,
      accountNumberLast4: payouts.accountNumberLast4,
      exportedAt: payouts.exportedAt,
      exportBatchId: payouts.exportBatchId,
      paidAt: payouts.paidAt,
      failureReason: payouts.failureReason,
    })
    .from(payouts)
    .innerJoin(quotes, eq(payouts.quoteId, quotes.id))
    .where(filterCondition(filter))
    .orderBy(filter === "paid" ? desc(payouts.paidAt) : payouts.createdAt)
    .limit(500);
}

export const BANK_CSV_HEADER = ["payee_name", "sort_code", "account_number", "amount", "reference"];

/** Bank references: letters, digits and spaces, 18 characters (Faster Payments). */
export function bankReference(reference: string) {
  return reference.replace(/[^A-Za-z0-9 ]/g, "").slice(0, 18);
}

/**
 * Creates a bank payment file for ready bank-transfer payouts and moves
 * them to processing. Returns the CSV, or null when nothing is ready.
 */
export async function exportPayoutBatch(
  db: AppDb,
  input: { staffId: string; payoutIds?: string[] },
  options: { cipher: FieldCipher; meta?: RequestMeta; now?: Date },
): Promise<{ csv: string; batchId: string; count: number; totalPence: number } | null> {
  const now = options.now ?? new Date();
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const rows = await tx
      .select({
        id: payouts.id,
        amountPence: payouts.amountPence,
        reference: quotes.reference,
        accountHolderNameEncrypted: payouts.accountHolderNameEncrypted,
        sortCodeEncrypted: payouts.sortCodeEncrypted,
        accountNumberEncrypted: payouts.accountNumberEncrypted,
      })
      .from(payouts)
      .innerJoin(quotes, eq(payouts.quoteId, quotes.id))
      .where(
        and(
          eq(payouts.status, "pending"),
          eq(payouts.method, "bank_transfer"),
          eq(quotes.status, "approved"),
          isNull(payouts.exportedAt),
          input.payoutIds?.length ? inArray(payouts.id, input.payoutIds) : undefined,
        ),
      )
      .orderBy(payouts.createdAt)
      .for("update", { of: payouts });
    if (!rows.length) return null;

    const batchId = `PB-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const csvRows = rows.map((r) => {
      const bank = decryptBankDetails(
        {
          accountHolderNameEncrypted: r.accountHolderNameEncrypted!,
          sortCodeEncrypted: r.sortCodeEncrypted!,
          accountNumberEncrypted: r.accountNumberEncrypted!,
        },
        options.cipher,
      );
      return [
        bank.accountHolderName,
        `${bank.sortCode.slice(0, 2)}-${bank.sortCode.slice(2, 4)}-${bank.sortCode.slice(4)}`,
        bank.accountNumber,
        (r.amountPence / 100).toFixed(2),
        bankReference(r.reference),
      ];
    });
    const ids = rows.map((r) => r.id);
    await tx
      .update(payouts)
      .set({
        status: "processing",
        exportedAt: now,
        exportBatchId: batchId,
        processedBy: input.staffId,
      })
      .where(inArray(payouts.id, ids));
    const totalPence = rows.reduce((sum, r) => sum + r.amountPence, 0);
    await recordAudit(
      tx,
      {
        actorType: "staff",
        actorId: input.staffId,
        action: "payout.exported",
        entityType: "payout_batch",
        entityId: batchId,
        changes: { after: { payoutIds: ids, count: ids.length, totalPence } },
      },
      options.meta,
    );
    return { csv: toCsv(BANK_CSV_HEADER, csvRows), batchId, count: ids.length, totalPence };
  });
}

/** Marks payouts paid (and their quotes). Returns the quotes to email. */
export async function markPayoutsPaid(
  db: AppDb,
  input: { staffId: string; payoutIds: string[] },
  meta?: RequestMeta,
  now = new Date(),
): Promise<{ quoteId: string; amountPence: number; last4: string | null }[]> {
  return db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const rows = await tx
      .select({
        id: payouts.id,
        quoteId: payouts.quoteId,
        status: payouts.status,
        amountPence: payouts.amountPence,
        last4: payouts.accountNumberLast4,
        quoteStatus: quotes.status,
      })
      .from(payouts)
      .innerJoin(quotes, eq(payouts.quoteId, quotes.id))
      .where(inArray(payouts.id, input.payoutIds))
      .for("update", { of: payouts });
    const payable = rows.filter(
      (r) => (r.status === "pending" || r.status === "processing") && r.quoteStatus === "approved",
    );
    if (payable.length !== input.payoutIds.length) {
      throw new ActionError("Some payouts aren’t ready to be marked paid. Refresh and try again.");
    }
    for (const p of payable) {
      await tx
        .update(payouts)
        .set({ status: "paid", paidAt: now, processedBy: input.staffId, failureReason: null })
        .where(eq(payouts.id, p.id));
      await tx.update(quotes).set({ status: "paid" }).where(eq(quotes.id, p.quoteId));
      await recordAudit(
        tx,
        {
          actorType: "staff",
          actorId: input.staffId,
          action: "payout.paid",
          entityType: "payout",
          entityId: p.id,
          changes: {
            before: { status: p.status },
            after: { status: "paid", amountPence: p.amountPence },
          },
        },
        meta,
      );
    }
    return payable.map((p) => ({ quoteId: p.quoteId, amountPence: p.amountPence, last4: p.last4 }));
  });
}

/** A bank transfer bounced: back to pending so it can be fixed and re-exported. */
export async function markPayoutFailed(
  db: AppDb,
  input: { staffId: string; payoutId: string; reason: string },
  meta?: RequestMeta,
) {
  await db.transaction(async (transaction) => {
    const tx = transaction as unknown as AppDb;
    const [row] = await tx
      .select({ status: payouts.status })
      .from(payouts)
      .where(eq(payouts.id, input.payoutId))
      .for("update");
    if (!row || !["processing", "pending"].includes(row.status)) {
      throw new ActionError("Only unpaid payouts can be marked failed.");
    }
    await tx
      .update(payouts)
      .set({
        status: "pending",
        exportedAt: null,
        exportBatchId: null,
        failureReason: input.reason,
      })
      .where(eq(payouts.id, input.payoutId));
    await recordAudit(
      tx,
      {
        actorType: "staff",
        actorId: input.staffId,
        action: "payout.failed",
        entityType: "payout",
        entityId: input.payoutId,
        changes: {
          before: { status: row.status },
          after: { status: "pending", reason: input.reason },
        },
      },
      meta,
    );
  });
}
