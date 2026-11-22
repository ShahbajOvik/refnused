/**
 * A Date as a MySQL DATETIME(3) literal in UTC ("2026-11-22 10:00:00.000"),
 * for raw sql where Drizzle's column mapping doesn't apply. The connection's
 * time zone is UTC (src/db/client.ts), so this matches stored values.
 */
export function mysqlDatetime(date: Date): string {
  return date.toISOString().replace("T", " ").replace("Z", "");
}
