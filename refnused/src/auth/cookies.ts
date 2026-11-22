import { publicEnv } from "@/lib/env";

/**
 * Cookie names for the two Auth.js instances. They must not overlap, so a
 * customer cookie can never be read as a staff one (or the reverse).
 * Secure (`__Secure-` / `__Host-`) prefixes are used whenever the site is
 * served over HTTPS.
 */
export const useSecureCookies = publicEnv.NEXT_PUBLIC_SITE_URL.startsWith("https://");

const securePrefix = useSecureCookies ? "__Secure-" : "";
const hostPrefix = useSecureCookies ? "__Host-" : "";

export const CUSTOMER_SESSION_COOKIE = `${securePrefix}ru.session`;
export const STAFF_SESSION_COOKIE = `${securePrefix}ru.staff-session`;

type CookieOptions = {
  httpOnly: boolean;
  sameSite: "lax";
  path: string;
  secure: boolean;
  maxAge?: number;
};

const base: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: useSecureCookies,
};
const shortLived: CookieOptions = { ...base, maxAge: 15 * 60 };

/** Full Auth.js `cookies` config with names namespaced by `ns`. */
export function authCookies(ns: "ru" | "ru.staff", sessionCookieName: string) {
  return {
    sessionToken: { name: sessionCookieName, options: base },
    callbackUrl: { name: `${securePrefix}${ns}.callback-url`, options: base },
    csrfToken: { name: `${hostPrefix}${ns}.csrf-token`, options: base },
    pkceCodeVerifier: { name: `${securePrefix}${ns}.pkce`, options: shortLived },
    state: { name: `${securePrefix}${ns}.state`, options: shortLived },
    nonce: { name: `${securePrefix}${ns}.nonce`, options: base },
    webauthnChallenge: { name: `${securePrefix}${ns}.webauthn-challenge`, options: shortLived },
  };
}

/** Cookie attributes for a staff session token we set ourselves (after MFA). */
export function staffSessionCookieOptions(expires: Date) {
  return { ...base, expires };
}
