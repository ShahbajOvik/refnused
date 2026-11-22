import { renderPerRequest } from "@/lib/security/per-request";

/** Rendered per request for its nonce CSP (src/lib/security/per-request.ts). */
export const instant = false;

export default async function PerRequestLayout({ children }: { children: React.ReactNode }) {
  await renderPerRequest();
  return children;
}
