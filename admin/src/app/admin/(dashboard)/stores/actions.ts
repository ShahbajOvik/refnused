"use server";

import { revalidatePath } from "next/cache";

import { staffAction } from "@/auth/guards";
import { refreshCache } from "@/lib/refresh-cache";
import { db } from "@refnused/database/db";
import { storeUpdateSchema, updateStore } from "@/lib/admin/people";

export const updateStoreAction = staffAction(
  "stores.manage",
  storeUpdateSchema,
  async ({ staff, input, meta }) => {
    await updateStore(db, { ...input, staffId: staff.id }, meta);
    // Store details appear on every public page (footer, home, JSON-LD).
    await refreshCache("stores");
    revalidatePath("/admin/stores");
  },
);
