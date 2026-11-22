"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { staffAction } from "@/auth/guards";
import { STAFF_ROLES } from "@/auth/roles";
import {
  changeStaffRole,
  createStaff,
  newStaffSchema,
  resetStaffTwoFactor,
  setStaffActive,
} from "@/auth/staff-admin";
import { db } from "@refnused/database/db";

// Every action re-checks the session and `staff.manage` on each call.

export const createStaffAction = staffAction(
  "staff.manage",
  newStaffSchema,
  async ({ staff, input, meta }) => {
    await createStaff(db, input, { type: "staff", id: staff.id }, meta);
    revalidatePath("/admin/staff");
  },
);

export const setStaffActiveAction = staffAction(
  "staff.manage",
  z.object({ staffId: z.uuid(), active: z.boolean() }),
  async ({ staff, input, meta }) => {
    await setStaffActive(db, { actorId: staff.id, ...input, meta });
    revalidatePath("/admin/staff");
  },
);

export const changeStaffRoleAction = staffAction(
  "staff.manage",
  z.object({ staffId: z.uuid(), role: z.enum(STAFF_ROLES) }),
  async ({ staff, input, meta }) => {
    await changeStaffRole(db, { actorId: staff.id, ...input, meta });
    revalidatePath("/admin/staff");
  },
);

export const resetStaffTwoFactorAction = staffAction(
  "staff.manage",
  z.object({ staffId: z.uuid() }),
  async ({ staff, input, meta }) => {
    await resetStaffTwoFactor(db, { actorId: staff.id, staffId: input.staffId, meta });
    revalidatePath("/admin/staff");
  },
);
