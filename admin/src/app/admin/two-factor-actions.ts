"use server";

import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/types";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { safeCallbackUrl } from "@/auth/access";
import { STAFF_SESSION_COOKIE } from "@/auth/cookies";
import { getStaffSession, setStaffSessionCookie, staffRelyingParty } from "@/auth/guards";
import {
  passkeyAuthenticationOptions,
  passkeyRegistrationOptions,
  verifyPasskeyAuthentication,
  verifyPasskeyRegistration,
} from "@/auth/staff-passkeys";
import { confirmTotpSetup, startTotpSetup, verifyStaffTotp } from "@/auth/staff-service";
import { db } from "@refnused/database/db";
import { getFieldCipher } from "@refnused/database/lib/crypto/field-encryption";
import { getRequestMeta } from "@refnused/database/lib/request-meta";

/*
 * Second-factor actions. These run before the session is fully signed in,
 * so they can't use staffAction(). Each one reloads the session from the
 * cookie, and the service functions check the session is in the right
 * state (e.g. awaiting 2FA, not idle, not locked) before doing anything.
 */

export type TwoFactorState = { error?: string } | undefined;
type PasskeyResult =
  { ok: true; redirectTo: string } | { ok: false; error?: string; redirectTo?: string };

/** Minimal shape check for WebAuthn responses from the browser (untrusted). */
const webauthnResponseSchema = z.looseObject({
  id: z.string().min(1).max(1024),
  rawId: z.string().min(1).max(1024),
  type: z.literal("public-key"),
  response: z.looseObject({ clientDataJSON: z.string().min(1) }),
});

const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code from your app");

async function sessionOrSignIn() {
  const { record } = await getStaffSession();
  if (!record) redirect("/admin/sign-in?reason=expired");
  return record;
}

async function endLockedSession(): Promise<never> {
  (await cookies()).delete(STAFF_SESSION_COOKIE);
  redirect("/admin/sign-in?reason=locked");
}

// TOTP --------------------------------------------------------------------------

export async function verifyTotpAction(_state: TwoFactorState, formData: FormData) {
  const record = await sessionOrSignIn();
  const code = codeSchema.safeParse(formData.get("code"));
  if (!code.success) return { error: code.error.issues[0]?.message };

  const result = await verifyStaffTotp(db, {
    record,
    code: code.data,
    cipher: getFieldCipher(),
    meta: await getRequestMeta(),
  });
  if (result.ok) {
    await setStaffSessionCookie(result.session);
    redirect(safeCallbackUrl(formData.get("callbackUrl"), "/admin"));
  }
  if (result.reason === "locked") return endLockedSession();
  if (result.reason === "invalid") {
    return {
      error: `That code didn’t work. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? "attempt" : "attempts"} left.`,
    };
  }
  redirect("/admin");
}

export async function startTotpSetupAction() {
  const record = await sessionOrSignIn();
  await startTotpSetup(db, { record, cipher: getFieldCipher() });
  refresh();
}

export async function confirmTotpSetupAction(_state: TwoFactorState, formData: FormData) {
  const record = await sessionOrSignIn();
  const code = codeSchema.safeParse(formData.get("code"));
  if (!code.success) return { error: code.error.issues[0]?.message };

  const result = await confirmTotpSetup(db, {
    record,
    code: code.data,
    cipher: getFieldCipher(),
    meta: await getRequestMeta(),
  });
  if (result.ok) {
    if (result.session) await setStaffSessionCookie(result.session);
    redirect(safeCallbackUrl(formData.get("callbackUrl"), "/admin/security?added=totp"));
  }
  if (result.reason === "locked") return endLockedSession();
  if (result.reason === "invalid")
    return { error: "That code didn’t work. Check your app and try again." };
  redirect("/admin");
}

// Passkeys ----------------------------------------------------------------------

export async function passkeyAuthOptionsAction() {
  const record = await sessionOrSignIn();
  return passkeyAuthenticationOptions(db, { record, rp: staffRelyingParty() });
}

export async function passkeyAuthVerifyAction(
  input: AuthenticationResponseJSON,
  callbackUrl: string,
): Promise<PasskeyResult> {
  const record = await sessionOrSignIn();
  const parsed = webauthnResponseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That passkey response wasn’t valid." };
  const response = parsed.data as unknown as AuthenticationResponseJSON;
  const result = await verifyPasskeyAuthentication(db, {
    record,
    response,
    rp: staffRelyingParty(),
    meta: await getRequestMeta(),
  });
  if (result.ok) {
    await setStaffSessionCookie(result.session);
    return { ok: true, redirectTo: safeCallbackUrl(callbackUrl, "/admin") };
  }
  if (result.reason === "locked") {
    (await cookies()).delete(STAFF_SESSION_COOKIE);
    return { ok: false, redirectTo: "/admin/sign-in?reason=locked" };
  }
  return { ok: false, error: "That passkey didn’t work. Try again or use your authenticator app." };
}

export async function passkeyRegOptionsAction() {
  const record = await sessionOrSignIn();
  return passkeyRegistrationOptions(db, { record, rp: staffRelyingParty() });
}

export async function passkeyRegVerifyAction(
  input: RegistrationResponseJSON,
  name: string,
  callbackUrl: string,
): Promise<PasskeyResult> {
  const record = await sessionOrSignIn();
  const parsed = webauthnResponseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That passkey response wasn’t valid." };
  const response = parsed.data as unknown as RegistrationResponseJSON;
  const result = await verifyPasskeyRegistration(db, {
    record,
    response,
    name: z.string().max(60).catch("Passkey").parse(name),
    rp: staffRelyingParty(),
    meta: await getRequestMeta(),
  });
  if (result.ok) {
    if (result.session) await setStaffSessionCookie(result.session);
    return { ok: true, redirectTo: safeCallbackUrl(callbackUrl, "/admin/security?added=passkey") };
  }
  return { ok: false, error: "The passkey wasn’t saved. Please try again." };
}
