"use server";

import { z } from "zod";

import { safeCallbackUrl } from "@/auth/access";
import { customerSignIn, customerSignOut } from "@/auth/customer";
import type { EmailFormState } from "@/components/auth/email-sign-in-form";

const emailSchema = z.object({
  email: z.email().transform((v) => v.trim().toLowerCase()),
  callbackUrl: z.string().optional(),
});

export async function signInWithEmail(
  _state: EmailFormState,
  formData: FormData,
): Promise<EmailFormState> {
  const parsed = emailSchema.safeParse({
    email: formData.get("email"),
    callbackUrl: formData.get("callbackUrl") ?? undefined,
  });
  if (!parsed.success) return { error: "Enter a valid email address, like name@example.co.uk" };

  // Redirects to the "check your email" page (throws NEXT_REDIRECT).
  await customerSignIn("resend", {
    email: parsed.data.email,
    redirectTo: safeCallbackUrl(parsed.data.callbackUrl, "/account"),
  });
}

export async function signInWithGoogle(formData: FormData) {
  await customerSignIn("google", {
    redirectTo: safeCallbackUrl(formData.get("callbackUrl"), "/account"),
  });
}

export async function signOutCustomer() {
  await customerSignOut({ redirectTo: "/" });
}
