import { auditLog } from "../db/schema";
import type { AppDb } from "../db/types";

export type RequestMeta = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type AuditEntry = Omit<
  typeof auditLog.$inferInsert,
  "id" | "createdAt" | "ipAddress" | "userAgent"
>;

/**
 * Appends to audit_log. Never put secrets, tokens, TOTP secrets or
 * decrypted bank details in `changes`.
 */
export async function recordAudit(db: AppDb, entry: AuditEntry, meta: RequestMeta = {}) {
  await db.insert(auditLog).values({
    ...entry,
    ipAddress: meta.ipAddress ?? null,
    userAgent: meta.userAgent?.slice(0, 512) ?? null,
  });
}
