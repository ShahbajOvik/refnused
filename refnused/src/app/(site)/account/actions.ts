"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import { CUSTOMER_SESSION_COOKIE } from "@/auth/cookies";
import type { AccountActionResult } from "@/components/account/action-form";
import { db } from "@refnused/database/db";
import {
  addressInputSchema,
  deleteAddress,
  saveAddress,
  setDefaultAddress,
} from "@/lib/account/addresses";
import {
  createPriceAlert,
  deletePriceAlert,
  priceAlertSchema,
  setPriceAlertActive,
  stopStockAlert,
} from "@/lib/account/alerts";
import { changePayoutDetails, payoutChangedEmail } from "@/lib/account/payout";
import { deleteCustomerAccount, setMarketingPreferences } from "@/lib/account/privacy";
import { respondToRevisedOffer } from "@refnused/database/lib/account/quotes";
import { currentCustomer } from "@/lib/account/session";
import {
  CODE_TTL_MINUTES,
  issueVerificationCode,
  verificationCodeEmail,
} from "@/lib/account/verification";
import { bankDetailsSchema } from "@refnused/database/lib/crypto/bank-details";
import { getFieldCipher } from "@refnused/database/lib/crypto/field-encryption";
import { sendEmail } from "@refnused/database/lib/notify/email";
import {
  createOrderRequest,
  orderRequestSchema,
} from "@refnused/database/lib/orders/order-service";
import { getRequestMeta } from "@refnused/database/lib/request-meta";
import { isRateLimited, TOO_MANY_REQUESTS } from "@refnused/database/lib/security/guards";
import { fieldErrorsByPath } from "@/lib/validation/field-errors";

import type { OrderRequestActionResult } from "../orders/actions";

/*
 * Every action re-checks the session (the page check isn't enough) and
 * only touches the signed-in customer's own records.
 */

const SIGNED_OUT: Extract<AccountActionResult, { ok: false }> = {
  ok: false,
  error: "Your session has ended. Please sign in again.",
};
const INVALID = "Please check the highlighted details.";

type Guard =
  | { ok: false; result: Extract<AccountActionResult, { ok: false }> }
  | { ok: true; customer: { id: string; email: string; name: string | null } };

async function guard(scope: string, limit = 30, windowSeconds = 600): Promise<Guard> {
  const customer = await currentCustomer();
  if (!customer) return { ok: false, result: SIGNED_OUT };
  if (await isRateLimited(`account:${scope}`, customer.id, limit, windowSeconds)) {
    return { ok: false, result: { ok: false, error: TOO_MANY_REQUESTS } };
  }
  return { ok: true, customer };
}

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
};

// Trade-ins ---------------------------------------------------------------------

export async function respondToOfferAction(formData: FormData): Promise<AccountActionResult> {
  const g = await guard("offer");
  if (!g.ok) return g.result;
  const parsed = z
    .object({ quoteId: z.uuid(), decision: z.enum(["accept", "return"]) })
    .safeParse({ quoteId: text(formData, "quoteId"), decision: text(formData, "decision") });
  if (!parsed.success) return { ok: false, error: "Something went wrong. Please try again." };

  const result = await respondToRevisedOffer(
    db,
    { customerId: g.customer.id, ...parsed.data },
    { meta: await getRequestMeta() },
  );
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "credited_to_order"
          ? "This trade-in was used as credit on an order, so please call us to arrange returning it."
          : "This offer has already been answered or has changed. Refresh the page to see the latest.",
    };
  }
  refresh();
  return {
    ok: true,
    message:
      result.decision === "accept"
        ? "Thanks, you’ve accepted the new offer. We’ll pay you within 2 working days."
        : "No problem. We’ll send your phone back free of charge and email you the tracking.",
  };
}

// Orders: returns and warranty ---------------------------------------------------

/** Same shape as the order page's action, so the same form component works for both. */
export async function createAccountOrderRequestAction(
  raw: unknown,
): Promise<OrderRequestActionResult> {
  const g = await guard("request", 10, 3600);
  if (!g.ok) return g.result;
  const parsed = orderRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: INVALID, fieldErrors: fieldErrorsByPath(parsed.error) };
  }
  const result = await createOrderRequest(db, { customerId: g.customer.id }, parsed.data, {
    meta: await getRequestMeta(),
  });
  if (!result.ok) {
    const messages = {
      unknown_order: "We couldn’t find that order.",
      unknown_item: "That phone isn’t part of your orders.",
      not_paid: "You can make a request once the order is paid.",
      window_closed: "Sorry, this is outside the time allowed. Contact us and we’ll help.",
      already_open: "There’s already an open request of this kind for this phone.",
    } as const;
    return { ok: false, error: messages[result.reason] };
  }
  refresh();
  return {
    ok: true,
    reference: result.reference,
    message:
      result.type === "return"
        ? `Return requested (${result.reference}). We’ll email you a free returns label within 1 working day.`
        : `Warranty claim sent (${result.reference}). We’ll be in touch within 2 working days.`,
  };
}

// Addresses ---------------------------------------------------------------------

export async function saveAddressAction(formData: FormData): Promise<AccountActionResult> {
  const g = await guard("address");
  if (!g.ok) return g.result;
  const id = z
    .uuid()
    .optional()
    .safeParse(text(formData, "id") || undefined);
  const parsed = addressInputSchema.safeParse({
    label: text(formData, "label"),
    name: text(formData, "name"),
    line1: text(formData, "line1"),
    line2: text(formData, "line2"),
    town: text(formData, "town"),
    county: text(formData, "county"),
    postcode: text(formData, "postcode"),
    isDefault: formData.get("isDefault") === "on",
  });
  if (!id.success || !parsed.success) {
    return {
      ok: false,
      error: INVALID,
      fieldErrors: parsed.success ? undefined : fieldErrorsByPath(parsed.error),
    };
  }
  const result = await saveAddress(db, g.customer.id, parsed.data, id.data);
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "limit"
          ? "You can save up to 10 addresses. Delete one first."
          : "That address couldn’t be found.",
    };
  }
  refresh();
  return { ok: true, message: id.data ? "Address updated." : "Address saved." };
}

export async function deleteAddressAction(formData: FormData): Promise<AccountActionResult> {
  const g = await guard("address");
  if (!g.ok) return g.result;
  const id = z.uuid().safeParse(text(formData, "id"));
  if (!id.success || !(await deleteAddress(db, g.customer.id, id.data))) {
    return { ok: false, error: "That address couldn’t be found." };
  }
  refresh();
  return { ok: true, message: "Address deleted." };
}

export async function setDefaultAddressAction(formData: FormData): Promise<AccountActionResult> {
  const g = await guard("address");
  if (!g.ok) return g.result;
  const id = z.uuid().safeParse(text(formData, "id"));
  if (!id.success || !(await setDefaultAddress(db, g.customer.id, id.data))) {
    return { ok: false, error: "That address couldn’t be found." };
  }
  refresh();
  return { ok: true, message: "Default address changed." };
}

// Verification codes ------------------------------------------------------------------

export async function sendVerificationCodeAction(formData: FormData): Promise<AccountActionResult> {
  const g = await guard("code", 5, 3600);
  if (!g.ok) return g.result;
  const purpose = z.enum(["payout_change", "delete_account"]).safeParse(text(formData, "purpose"));
  if (!purpose.success) return { ok: false, error: "Something went wrong. Please try again." };
  const { code } = await issueVerificationCode(db, g.customer.id, purpose.data);
  await sendEmail({
    to: g.customer.email,
    ...verificationCodeEmail({ code, purpose: purpose.data, minutes: CODE_TTL_MINUTES }),
  });
  return {
    ok: true,
    message: `We’ve emailed a 6-digit code to ${g.customer.email}. It lasts ${CODE_TTL_MINUTES} minutes.`,
  };
}

const CODE_ERRORS = {
  invalid: "That code isn’t right. Check the email, or send a new code.",
  expired: "That code has expired. Send a new one.",
  too_many_attempts: "Too many wrong codes. Send a new one.",
} as const;

// Payout details ------------------------------------------------------------------------

export async function changePayoutAction(formData: FormData): Promise<AccountActionResult> {
  const g = await guard("payout", 10, 3600);
  if (!g.ok) return g.result;
  const parsed = z
    .object({
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "Enter the 6-digit code from the email"),
      bank: bankDetailsSchema,
      applyToPending: z.boolean(),
    })
    .safeParse({
      code: text(formData, "code") ?? "",
      bank: {
        accountHolderName: text(formData, "accountHolderName") ?? "",
        sortCode: text(formData, "sortCode") ?? "",
        accountNumber: text(formData, "accountNumber") ?? "",
      },
      applyToPending: formData.get("applyToPending") === "on",
    });
  if (!parsed.success) {
    return { ok: false, error: INVALID, fieldErrors: fieldErrorsByPath(parsed.error) };
  }
  const result = await changePayoutDetails(
    db,
    {
      customerId: g.customer.id,
      code: parsed.data.code,
      details: parsed.data.bank,
      applyToPending: parsed.data.applyToPending,
    },
    { cipher: getFieldCipher(), meta: await getRequestMeta() },
  );
  if (!result.ok)
    return {
      ok: false,
      error: CODE_ERRORS[result.reason],
      fieldErrors: { code: [CODE_ERRORS[result.reason]] },
    };

  // Tell the account's email, in case it wasn't them.
  const email = g.customer.email;
  const last4 = parsed.data.bank.accountNumber.slice(-4);
  after(() =>
    sendEmail({ to: email, ...payoutChangedEmail({ last4 }) }).catch((error) =>
      console.error("[account] payout change email failed", error),
    ),
  );
  refresh();
  return {
    ok: true,
    message:
      result.appliedToPayouts > 0
        ? `Payout details saved. ${result.appliedToPayouts} open trade-in ${result.appliedToPayouts === 1 ? "payment" : "payments"} will go to the new account.`
        : "Payout details saved.",
  };
}

// Alerts --------------------------------------------------------------------------------

export async function createPriceAlertAction(formData: FormData): Promise<AccountActionResult> {
  const g = await guard("alert");
  if (!g.ok) return g.result;
  const parsed = priceAlertSchema.safeParse({
    type: text(formData, "type"),
    modelSlug: text(formData, "modelSlug"),
    grade: text(formData, "grade") || undefined,
    targetPounds: text(formData, "targetPounds"),
  });
  if (!parsed.success) {
    return { ok: false, error: INVALID, fieldErrors: fieldErrorsByPath(parsed.error) };
  }
  const result = await createPriceAlert(db, g.customer.id, parsed.data);
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "limit"
          ? "You can have up to 20 active alerts. Pause or delete one first."
          : "Choose a phone from the list.",
    };
  }
  refresh();
  return { ok: true, message: "Alert set. We’ll email you when the price reaches your target." };
}

export async function updatePriceAlertAction(formData: FormData): Promise<AccountActionResult> {
  const g = await guard("alert");
  if (!g.ok) return g.result;
  const parsed = z
    .object({ id: z.uuid(), op: z.enum(["pause", "resume", "delete"]) })
    .safeParse({ id: text(formData, "id"), op: text(formData, "op") });
  if (!parsed.success) return { ok: false, error: "Something went wrong. Please try again." };
  const { id, op } = parsed.data;
  const done =
    op === "delete"
      ? await deletePriceAlert(db, g.customer.id, id)
      : await setPriceAlertActive(db, g.customer.id, id, op === "resume");
  if (!done) return { ok: false, error: "That alert couldn’t be found." };
  refresh();
  return {
    ok: true,
    message:
      op === "delete" ? "Alert deleted." : op === "pause" ? "Alert paused." : "Alert resumed.",
  };
}

export async function stopStockAlertAction(formData: FormData): Promise<AccountActionResult> {
  const g = await guard("alert");
  if (!g.ok) return g.result;
  const id = z.uuid().safeParse(text(formData, "id"));
  if (!id.success || !(await stopStockAlert(db, g.customer.email, id.data))) {
    return { ok: false, error: "That alert couldn’t be found." };
  }
  refresh();
  return { ok: true, message: "Alert stopped." };
}

// Privacy -------------------------------------------------------------------------------

export async function updateMarketingAction(formData: FormData): Promise<AccountActionResult> {
  const g = await guard("marketing");
  if (!g.ok) return g.result;
  const checkbox = z
    .literal("on")
    .nullable()
    .catch(null)
    .transform((v) => v === "on");
  const prefs = z
    .object({ email: checkbox, sms: checkbox })
    .parse({ email: formData.get("email"), sms: formData.get("sms") });
  await setMarketingPreferences(db, g.customer.id, prefs, { meta: await getRequestMeta() });
  refresh();
  return { ok: true, message: "Preferences saved." };
}

export async function deleteAccountAction(formData: FormData): Promise<AccountActionResult> {
  const g = await guard("delete", 5, 3600);
  if (!g.ok) return g.result;
  const parsed = z
    .object({
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "Enter the 6-digit code from the email"),
      confirm: z.literal("DELETE", "Type DELETE to confirm"),
    })
    .safeParse({ code: text(formData, "code") ?? "", confirm: text(formData, "confirm")?.trim() });
  if (!parsed.success) {
    return { ok: false, error: INVALID, fieldErrors: fieldErrorsByPath(parsed.error) };
  }
  const result = await deleteCustomerAccount(
    db,
    { customerId: g.customer.id, code: parsed.data.code },
    { meta: await getRequestMeta() },
  );
  if (!result.ok) {
    if (result.reason === "blocked") {
      return {
        ok: false,
        error:
          "Some things are still in progress. Once they’re finished you can delete your account.",
      };
    }
    return {
      ok: false,
      error: CODE_ERRORS[result.reason],
      fieldErrors: { code: [CODE_ERRORS[result.reason]] },
    };
  }
  // Sessions were deleted with the account; drop the cookie too.
  (await cookies()).delete(CUSTOMER_SESSION_COOKIE);
  redirect("/account-deleted");
}
