/**
 * CSRF check for cookie-authenticated route handlers. Server Actions get
 * this from Next.js (it compares Origin with Host); route handlers don't.
 * Session cookies are SameSite=Lax as well, so this is a second layer.
 *
 * Allows a request only when the browser says it came from this origin:
 * Sec-Fetch-Site "same-origin", or (older browsers) an Origin header that
 * matches the site.
 */
export function isSameOriginRequest(request: Request, siteUrl: string): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;
  const origin = request.headers.get("origin");
  if (!origin) return fetchSite === "same-origin";
  const allowed = new Set([new URL(request.url).origin]);
  try {
    allowed.add(new URL(siteUrl).origin);
  } catch {
    // Misconfigured site URL: fall back to the request's own origin.
  }
  return allowed.has(origin);
}
