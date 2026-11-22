/*
 * MySQL errors, as thrown by mysql2 (Drizzle wraps them in `cause`).
 * MySQL reports duplicates and failed CHECKs by error code, with the key or
 * constraint name only in the message, so this pulls both out.
 */

export type DbError = {
  /** MySQL error code, e.g. "ER_DUP_ENTRY", "ER_CHECK_CONSTRAINT_VIOLATED". */
  code?: string;
  /** Constraint or unique key name, when MySQL names one. */
  constraint?: string;
  message?: string;
};

export function dbError(error: unknown): DbError {
  const raw = ((error as { cause?: unknown })?.cause ?? error) as {
    code?: string;
    sqlMessage?: string;
    message?: string;
  };
  const message = raw?.sqlMessage ?? raw?.message ?? "";
  // "Check constraint 'products_price_check' is violated."
  // "Duplicate entry 'x' for key 'customers.customers_email_idx'"
  const check = message.match(/Check constraint '([^']+)' is violated/);
  const duplicate = message.match(/for key '(?:[^'.]+\.)?([^']+)'/);
  return { code: raw?.code, constraint: check?.[1] ?? duplicate?.[1], message };
}

/** A unique key was violated (optionally a specific one). */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const e = dbError(error);
  return e.code === "ER_DUP_ENTRY" && (!constraint || e.constraint === constraint);
}

/** A CHECK constraint failed (optionally a specific one). */
export function isCheckViolation(error: unknown, constraint?: string): boolean {
  const e = dbError(error);
  return e.code === "ER_CHECK_CONSTRAINT_VIOLATED" && (!constraint || e.constraint === constraint);
}

/**
 * Rows changed by an UPDATE or DELETE (mysql2's ResultSetHeader), e.g. to
 * tell whether a conditional update ("… where status = 'pending'") won.
 * MySQL has no RETURNING; use this instead of `.returning()` for that.
 */
export function affectedRows(result: unknown): number {
  const header = (Array.isArray(result) ? result[0] : result) as { affectedRows?: number };
  return header?.affectedRows ?? 0;
}
