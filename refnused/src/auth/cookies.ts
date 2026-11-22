import { publicEnv } from "@refnused/database/lib/env";

/**
 * Customer cookie names (the website). Staff cookies use a different
 * namespace in the admin app (admin/src/auth/cookies.ts).
 * Secure (`__Secure-` / `__Host-`) prefixes are used whenever the site is
 * served over HTTPS.
 */
export const useSecureCookies = publicEnv.NEXT_PUBLIC_SITE_URL.startsWith("https://");

const securePrefix = useSecureCookies ? "__Secure-" : "";
const hostPrefix = useSecureCookies ? "__Host-" : "";

export const CUSTOMER_SESSION_COOKIE = `${securePrefix}ru.session`;

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
export function authCookies(ns: "ru", sessionCookieName: string) {
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
