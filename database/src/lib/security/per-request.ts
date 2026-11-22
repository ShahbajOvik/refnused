import { connection } from "next/server";

/*
 * Sensitive routes (src/lib/security/csp.ts SENSITIVE_PREFIXES) get a nonce
 * CSP from src/proxy.ts. A nonce only reaches the page's scripts if the
 * whole page, shell included, renders for that request, so each of those
 * segments' layouts awaits this outside any <Suspense> and sets
 * `export const instant = false` (allows a blocking route with Cache
 * Components). src/lib/security/csp.test.tsx checks every prefix does.
 */
export async function renderPerRequest(): Promise<void> {
  await connection();
}
