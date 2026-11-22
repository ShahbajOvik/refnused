"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { staffAction } from "@/auth/guards";
import { refreshCache } from "@/lib/refresh-cache";
import { db } from "@refnused/database/db";
import { ActionError } from "@refnused/database/lib/action-error";
import { previewPriceImport, priceChangeSchema, updatePrices } from "@/lib/admin/prices";
import { pushPriceAlerts } from "@/lib/push/price-alerts";

async function refresh(variantIds: string[]) {
  await refreshCache("trade-in-prices");
  revalidatePath("/admin/prices");
  // Offers may now meet customers' trade-in price alerts.
  after(() => pushPriceAlerts({ variantIds }));
}

export const savePricesAction = staffAction(
  "prices.update",
  z.object({ changes: z.array(priceChangeSchema).min(1, "Change a price first").max(500) }),
  async ({ staff, input, meta }) => {
    const changed = await updatePrices(
      db,
      input.changes,
      { staffId: staff.id, source: "table" },
      meta,
    );
    if (changed) await refresh(input.changes.map((c) => c.variantId));
    return changed;
  },
);

const csvInput = z.object({
  csv: z.string().min(1, "Choose a CSV file").max(2_000_000, "The file is too big"),
});

/** Checks a CSV and lists what would change. Saves nothing. */
export const previewImportAction = staffAction("prices.update", csvInput, async ({ input }) =>
  previewPriceImport(db, input.csv),
);

/** Re-checks the same CSV on the server and applies it, all or nothing. */
export const applyImportAction = staffAction(
  "prices.update",
  csvInput,
  async ({ staff, input, meta }) => {
    const preview = await previewPriceImport(db, input.csv);
    if (preview.errors.length) throw new ActionError("Fix the errors in the file first.");
    const changed = await updatePrices(
      db,
      preview.changes.map(({ variantId, grade, pricePence }) => ({ variantId, grade, pricePence })),
      { staffId: staff.id, source: "csv" },
      meta,
    );
    if (changed) await refresh(preview.changes.map((c) => c.variantId));
    return changed;
  },
);
