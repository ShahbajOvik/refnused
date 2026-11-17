"use server";

import { z } from "zod";

import { safeCallbackUrl } from "@/auth/access";
import { staffSignIn, staffSignOut } from "@/auth/staff";
import type { EmailFormState } from "@/components/auth/email-sign-in-form";

const emailSchema = z.object({
  email: z.email().transform((v) => v.trim().toLowerCase()),
  callbackUrl: z.string().optional(),
});

export async function signInStaffWithEmail(
  _state: EmailFormState,
  formData: FormData,
): Promise<EmailFormState> {
  const parsed = emailSchema.safeParse({
    email: formData.get("email"),
    callbackUrl: formData.get("callbackUrl") ?? undefined,
  });
  if (!parsed.success) return { error: "Enter a valid work email address." };

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
