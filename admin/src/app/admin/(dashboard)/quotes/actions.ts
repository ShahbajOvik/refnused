"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { staffAction } from "@/auth/guards";
import { db } from "@refnused/database/db";
import { quoteApprovedEmail, quoteRejectedEmail, revisedOfferEmail } from "@/lib/admin/messages";
import {
  inspectionSchema,
  markQuoteReceived,
  markQuoteReturned,
  quoteContact,
  recordInspection,
} from "@refnused/database/lib/admin/quotes";
import { sendEmail } from "@refnused/database/lib/notify/email";
import { pushQuoteUpdate } from "@refnused/database/lib/push/notify";
import { absoluteUrl } from "@refnused/database/lib/seo";

const quoteId = z.object({ quoteId: z.uuid() });

export const markReceivedAction = staffAction(
  "quotes.manage",
  quoteId,
  async ({ staff, input, meta }) => {
    await markQuoteReceived(db, { quoteId: input.quoteId, staffId: staff.id }, meta);
    after(() => pushQuoteUpdate(input.quoteId, "received"));
    revalidatePath("/admin/quotes");
  },
);

export const markReturnedAction = staffAction(
  "quotes.manage",
  quoteId,
  async ({ staff, input, meta }) => {
    await markQuoteReturned(db, { quoteId: input.quoteId, staffId: staff.id }, meta);
    after(() => pushQuoteUpdate(input.quoteId, "returned"));
    revalidatePath("/admin/quotes");
  },
);

/** Records the inspection and emails the customer about the outcome. */
export const recordInspectionAction = staffAction(
  "inspections.manage",
  inspectionSchema,
  async ({ staff, input, meta }) => {
    const result = await recordInspection(db, { ...input, staffId: staff.id }, meta);
    if (result.outcome !== "pending_check") {
      const outcome = result.outcome;
      after(() => pushQuoteUpdate(input.quoteId, outcome));
    }
    const contact = await quoteContact(db, input.quoteId);
    if (contact?.email && result.outcome !== "pending_check") {
      const to = contact.email;
      const name = contact.name ?? "there";
      const message =
        result.outcome === "revised"
          ? revisedOfferEmail({
              name,
              reference: contact.reference,
              device: contact.device,
              offeredPence: contact.offeredPricePence,
              revisedPence: input.revisedPounds!,
              reason: input.notes,
              accountUrl: absoluteUrl("/account/quotes"),
            })
          : result.outcome === "rejected"
            ? quoteRejectedEmail({ name, reference: contact.reference, device: contact.device })
            : quoteApprovedEmail({
                name,
                reference: contact.reference,
                amountPence: contact.payoutPence ?? contact.offeredPricePence,
              });
      after(() =>
        sendEmail({ to, ...message }).catch((error) =>
          console.error("[admin] inspection email failed", error),
        ),
      );
    }
    revalidatePath("/admin/quotes");
    return result.outcome;
  },
);
