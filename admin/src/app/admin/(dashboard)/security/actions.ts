"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { STAFF_SESSION_COOKIE } from "@/auth/cookies";
import { staffAction } from "@/auth/guards";
import {
  changeOwnStaffPassword,
  changePasswordSchema,
  StaffPasswordError,
} from "@/auth/staff-password";
import { db } from "@refnused/database/db";
import { serverEnv } from "@refnused/database/lib/env.server";

export const changeOwnPasswordAction = staffAction(
  "admin.access",
  changePasswordSchema,
  async ({ staff, input, meta }) => {
    const sessionToken = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
    if (!sessionToken) throw new StaffPasswordError("Your session has ended. Sign in again.");
    await changeOwnStaffPassword(db, {
      staffId: staff.id,
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      sessionToken,
      secret: serverEnv.AUTH_SECRET,
      meta,
    });
    revalidatePath("/admin/security");
  },
);
