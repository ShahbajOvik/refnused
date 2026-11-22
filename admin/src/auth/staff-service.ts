import { eq, sql } from "drizzle-orm";

import type { StaffSessionRecord } from "@/auth/staff-session";
import { staffSessions, staffUsers } from "@refnused/database/db/schema";
import type { AppDb } from "@refnused/database/db/types";

/*
 * Staff authentication data access. Every function takes `db` so it runs
 * against a test MySQL in tests. Callers are src/auth/staff.ts (Auth.js), the
 * proxy and src/auth/guards.ts.
 */

/** Active staff member for an email, or null. Sign-in never creates staff. */
export async function findStaffForSignIn(db: AppDb, email: string | null | undefined) {
  if (!email) return null;
  const [staff] = await db
    .select({ id: staffUsers.id, email: staffUsers.email, isActive: staffUsers.isActive })
    .from(staffUsers)
    .where(sql`lower(${staffUsers.email}) = lower(${email})`)
    .limit(1);
  return staff?.isActive ? staff : null;
}

export async function loadStaffSession(
  db: AppDb,
  sessionToken: string,
): Promise<StaffSessionRecord | null> {
  const [row] = await db
    .select({
      sessionToken: staffSessions.sessionToken,
      expires: staffSessions.expires,
      createdAt: staffSessions.createdAt,
      lastActiveAt: staffSessions.lastActiveAt,
      staffId: staffUsers.id,
      email: staffUsers.email,
      name: staffUsers.name,
      role: staffUsers.role,
      isActive: staffUsers.isActive,
    })
    .from(staffSessions)
    .innerJoin(staffUsers, eq(staffSessions.userId, staffUsers.id))
    .where(eq(staffSessions.sessionToken, sessionToken))
    .limit(1);
  if (!row) return null;

  return {
    sessionToken: row.sessionToken,
    expires: row.expires,
    createdAt: row.createdAt,
    lastActiveAt: row.lastActiveAt,
    staff: {
      id: row.staffId,
      email: row.email,
      name: row.name,
      role: row.role,
      isActive: row.isActive,
    },
  };
}

export async function recordStaffActivity(db: AppDb, sessionToken: string, now = new Date()) {
  await db
    .update(staffSessions)
    .set({ lastActiveAt: now })
    .where(eq(staffSessions.sessionToken, sessionToken));
}

export async function deleteStaffSession(db: AppDb, sessionToken: string) {
  await db.delete(staffSessions).where(eq(staffSessions.sessionToken, sessionToken));
}

export async function deleteAllStaffSessions(db: AppDb, staffId: string) {
  await db.delete(staffSessions).where(eq(staffSessions.userId, staffId));
}
