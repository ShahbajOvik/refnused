"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { staffAction } from "@/auth/guards";
import { db } from "@/db";
import { payoutPaidEmail } from "@/lib/admin/messages";
import { exportPayoutBatch, markPayoutFailed, markPayoutsPaid } from "@/lib/admin/payouts";
import { quoteContact } from "@/lib/admin/quotes";
import { getFieldCipher } from "@/lib/crypto/field-encryption";
import { sendEmail } from "@/lib/notify/email";

/** Creates the bank payment file. The CSV goes straight to the browser as a download. */
export const exportPayoutsAction = staffAction(
  "payouts.approve",
  z.object({ payoutIds: z.array(z.uuid()).max(500).optional() }),
  async ({ staff, input, meta }) => {
    const batch = await exportPayoutBatch(
      db,
      { staffId: staff.id, payoutIds: input.payoutIds },
      { cipher: getFieldCipher(), meta },
    );
    revalidatePath("/admin/payouts");
    return batch;
  },
);

export const markPaidAction = staffAction(
  "payouts.approve",
  z.object({ payoutIds: z.array(z.uuid()).min(1, "Tick the payouts that were paid").max(500) }),
  async ({ staff, input, meta }) => {
    const paid = await markPayoutsPaid(db, { staffId: staff.id, payoutIds: input.payoutIds }, meta);
    after(async () => {
      for (const p of paid) {
        const contact = await quoteContact(db, p.quoteId);
        if (!contact?.email) continue;
        await sendEmail({
          to: contact.email,
          ...payoutPaidEmail({
            name: contact.name ?? "there",
            reference: contact.reference,
            amountPence: p.amountPence,
            last4: p.last4,
          }),
        }).catch((error) => console.error("[admin] payout email failed", error));
      }
    });
    revalidatePath("/admin/payouts");
    return paid.length;
  },
);

export const markFailedAction = staffAction(
  "payouts.approve",
  z.object({ payoutId: z.uuid(), reason: z.string().trim().min(3, "Give a reason").max(300) }),
  async ({ staff, input, meta }) => {
    await markPayoutFailed(db, { staffId: staff.id, ...input }, meta);
    revalidatePath("/admin/payouts");
  },
);
