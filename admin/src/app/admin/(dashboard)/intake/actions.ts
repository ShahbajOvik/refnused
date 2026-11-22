"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { staffAction } from "@/auth/guards";
import { refreshCache } from "@/lib/refresh-cache";
import { db } from "@refnused/database/db";
import {
  createProductFromIntake,
  intakeSchema,
  lookupImei,
  productUpdateSchema,
  updateProductAdmin,
} from "@/lib/admin/intake";
import { pushPriceAlerts } from "@/lib/push/price-alerts";
import { imeiSchema } from "@refnused/database/lib/validation/uk";

export const lookupImeiAction = staffAction(
  "products.manage",
  z.object({ imei: imeiSchema }),
  async ({ input }) => lookupImei(db, input.imei),
);

export const createProductAction = staffAction(
  "products.manage",
  intakeSchema,
  async ({ staff, input, meta }) => {
    const product = await createProductFromIntake(db, { ...input, staffId: staff.id }, meta);
    if (product.status === "listed") {
      await refreshCache("products");
      // A new unit may meet customers' shop price alerts.
      after(() => pushPriceAlerts({ productIds: [product.id] }));
    }
    revalidatePath("/admin/products");
    return product;
  },
);

export const updateProductAction = staffAction(
  "products.manage",
  productUpdateSchema,
  async ({ staff, input, meta }) => {
    const result = await updateProductAdmin(db, { ...input, staffId: staff.id }, meta);
    if (result.changed) {
      await refreshCache("products");
      after(() => pushPriceAlerts({ productIds: [input.productId] }));
    }
    revalidatePath("/admin/products");
    return result.changed;
  },
);
