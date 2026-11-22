import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { STAFF_ROLES, type StaffRole } from "@/auth/roles";
import { deleteAllStaffSessions, resetStaffMfa } from "@/auth/staff-service";
import { staffUsers } from "@refnused/database/db/schema";
import type { AppDb } from "@refnused/database/db/types";
import { ActionError } from "@refnused/database/lib/action-error";
import { recordAudit, type RequestMeta } from "@refnused/database/lib/audit";

/** Owner-only staff management. Callers must check `staff.manage` first. */

export class StaffAdminError extends ActionError {
  override name = "StaffAdminError";
}

export const newStaffSchema = z.object({
  email: z.email("Enter a valid email address").transform((v) => v.trim().toLowerCase()),
  name: z.string().trim().min(1, "Enter a name").max(100),
  role: z.enum(STAFF_ROLES),
});

export async function listStaff(db: AppDb) {
  return db
    .select({
      id: staffUsers.id,
      name: staffUsers.name,
      email: staffUsers.email,
      role: staffUsers.role,
      isActive: staffUsers.isActive,
      hasTotp: sql<boolean>`${staffUsers.totpEnabledAt} is not null`.mapWith(Boolean),
      passkeys: sql<number>`(select count(*) from staff_passkeys where staff_passkeys.staff_id = ${staffUsers.id})`,
      lastLoginAt: staffUsers.lastLoginAt,
    })
    .from(staffUsers)
    .orderBy(asc(staffUsers.name));
}

export async function createStaff(
  db: AppDb,
  input: z.input<typeof newStaffSchema>,
  actor: { type: "staff" | "system"; id?: string },
  meta: RequestMeta = {},
) {
  const data = newStaffSchema.parse(input);
  const existing = await db
    .select({ id: staffUsers.id })
    .from(staffUsers)
    .where(sql`lower(${staffUsers.email}) = ${data.email}`);
  if (existing.length > 0)
    throw new StaffAdminError("A staff account with that email already exists");

  const [created] = await db.insert(staffUsers).values(data).$returningId();
  await recordAudit(
    db,
    {
      actorType: actor.type,
      actorId: actor.id ?? null,
      action: "staff.create",
      entityType: "staff_user",
      entityId: created!.id,
      changes: { after: data },
    },
    meta,
  );
  return created!;
}

async function getStaff(db: AppDb, staffId: string) {
  const [staff] = await db.select().from(staffUsers).where(eq(staffUsers.id, staffId));
  if (!staff) throw new StaffAdminError("Staff member not found");
  return staff;
}

/** Refuses changes that would leave nobody able to manage staff. */
async function assertAnotherActiveOwner(db: AppDb, exceptId: string) {
  const owners = await db
    .select({ id: staffUsers.id })
    .from(staffUsers)
    .where(
      and(eq(staffUsers.role, "owner"), eq(staffUsers.isActive, true), ne(staffUsers.id, exceptId)),
    );
  if (owners.length === 0)
    throw new StaffAdminError("There must always be at least one active owner");
}

export async function setStaffActive(
  db: AppDb,
  input: { actorId: string; staffId: string; active: boolean; meta?: RequestMeta },
) {
  if (input.actorId === input.staffId) throw new StaffAdminError("You can't deactivate yourself");
  const staff = await getStaff(db, input.staffId);
  if (!input.active && staff.role === "owner") await assertAnotherActiveOwner(db, staff.id);

  await db.update(staffUsers).set({ isActive: input.active }).where(eq(staffUsers.id, staff.id));
  if (!input.active) await deleteAllStaffSessions(db, staff.id);
  await recordAudit(
    db,
    {
      actorType: "staff",
      actorId: input.actorId,
      action: input.active ? "staff.reactivate" : "staff.deactivate",
      entityType: "staff_user",
      entityId: staff.id,
      changes: { before: { isActive: staff.isActive }, after: { isActive: input.active } },
    },
    input.meta,
  );
}

export async function changeStaffRole(
  db: AppDb,
  input: { actorId: string; staffId: string; role: StaffRole; meta?: RequestMeta },
) {
  if (input.actorId === input.staffId) throw new StaffAdminError("You can't change your own role");
  const staff = await getStaff(db, input.staffId);
  if (staff.role === input.role) return;
  if (staff.role === "owner") await assertAnotherActiveOwner(db, staff.id);

  await db.update(staffUsers).set({ role: input.role }).where(eq(staffUsers.id, staff.id));
  // New permissions take effect immediately: end their sessions.
  await deleteAllStaffSessions(db, staff.id);
  await recordAudit(
    db,
    {
      actorType: "staff",
      actorId: input.actorId,
      action: "staff.change_role",
      entityType: "staff_user",
      entityId: staff.id,
      changes: { before: { role: staff.role }, after: { role: input.role } },
    },
    input.meta,
  );
}

/** For lost devices: removes TOTP and passkeys; they enrol again at next sign-in. */
export async function resetStaffTwoFactor(
  db: AppDb,
  input: { actorId: string; staffId: string; meta?: RequestMeta },
) {
  const staff = await getStaff(db, input.staffId);
  await resetStaffMfa(db, staff.id);
  await recordAudit(
    db,
    {
      actorType: "staff",
      actorId: input.actorId,
      action: "staff.mfa_reset",
      entityType: "staff_user",
      entityId: staff.id,
    },
    input.meta,
  );
}
