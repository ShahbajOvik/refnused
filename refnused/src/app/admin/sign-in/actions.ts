"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { PasswordFormState } from "@/app/admin/_components/staff-password-sign-in-form";
import { decideAdminAccess, safeCallbackUrl } from "@/auth/access";
import { STAFF_SESSION_COOKIE } from "@/auth/cookies";
import { setStaffSessionCookie } from "@/auth/guards";
import { staffSignIn, staffSignOut } from "@/auth/staff";
import { passwordSignInSchema, signInStaffWithPassword } from "@/auth/staff-password";
import { deleteStaffSession, loadStaffSession } from "@/auth/staff-service";
import { evaluateStaffSession } from "@/auth/staff-session";
import type { EmailFormState } from "@/components/auth/email-sign-in-form";
import { db } from "@refnused/database/db";
import { serverEnv } from "@refnused/database/lib/env.server";
import { getRequestMeta } from "@refnused/database/lib/request-meta";
import { BOT_CHECK_FAILED, passesBotCheck, TOO_MANY_REQUESTS } from "@refnused/database/lib/security/guards";
import { magicLinkGuard } from "@refnused/database/lib/security/magic-link-guard";

const emailSchema = z.object({
  email: z.email().transform((v) => v.trim().toLowerCase()),
  callbackUrl: z.string().optional(),
});

/**
 * First factor only: the new session still has to pass 2FA, which the proxy
 * and requireStaff() enforce on every /admin request.
 */
export async function signInStaffWithPasswordAction(
  state: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const rawEmail = formData.get("email");
  const fail = (error: string): PasswordFormState => ({
    error,
    email: typeof rawEmail === "string" ? rawEmail.slice(0, 254) : "",
    attempt: (state?.attempt ?? 0) + 1,
  });
  // The same message for every wrong detail, so it can't confirm who is staff.
  const invalid = "That staff ID or password isn’t right.";

  const parsed = passwordSignInSchema.safeParse({
    email: rawEmail,
    password: formData.get("password"),
  });
  if (!parsed.success) return fail(invalid);

  const meta = await getRequestMeta();
  const token = formData.get("cf-turnstile-response");
  const human = await passesBotCheck(
    typeof token === "string" ? token : null,
    "staff_sign_in",
    meta.ipAddress,
  );
  if (!human) return fail(BOT_CHECK_FAILED);

  const result = await signInStaffWithPassword(db, {
    ...parsed.data,
    secret: serverEnv.AUTH_SECRET,
    meta,
  });
  if (!result.ok) return fail(result.reason === "rate_limited" ? TOO_MANY_REQUESTS : invalid);

  // Replace any earlier session in this browser rather than leaving it behind.
  const previous = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  if (previous) await deleteStaffSession(db, previous);
  await setStaffSessionCookie(result.session);

  // Go straight to the 2FA step, so the address bar matches the page shown.
  const target = safeCallbackUrl(formData.get("callbackUrl"), "/admin");
  const record = await loadStaffSession(db, result.session.sessionToken);
  const decision = decideAdminAccess({
    pathname: target,
    status: evaluateStaffSession(record),
    role: record?.staff.role,
  });
  redirect(decision.type === "redirect" ? decision.to : target);
}

export async function signInStaffWithEmail(
  _state: EmailFormState,
  formData: FormData,
): Promise<EmailFormState> {
  const parsed = emailSchema.safeParse({
    email: formData.get("email"),
    callbackUrl: formData.get("callbackUrl") ?? undefined,
  });
  if (!parsed.success) return { error: "Enter a valid work email address." };
  const blocked = await magicLinkGuard("staff", parsed.data.email, formData);
  if (blocked) return { error: blocked };

  await staffSignIn("resend", {
    email: parsed.data.email,
    redirectTo: safeCallbackUrl(parsed.data.callbackUrl, "/admin"),
  });
}

export async function signInStaffWithGoogle(formData: FormData) {
  await staffSignIn("google", {
    redirectTo: safeCallbackUrl(formData.get("callbackUrl"), "/admin"),
  });
}

export async function signOutStaff() {
  await staffSignOut({ redirectTo: "/admin/sign-in" });
}
