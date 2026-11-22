import type { Metadata } from "next";

import { renderPerRequest } from "@refnused/database/lib/security/per-request";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | RefurbednUsed admin" },
  robots: { index: false, follow: false, nocache: true },
};

/** Rendered per request for its nonce CSP (src/lib/security/per-request.ts). */
export const instant = false;

/** Admin area: no public header/footer, never indexed. */
export default async function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  await renderPerRequest();
  return <div className="flex min-h-dvh flex-col bg-muted/30">{children}</div>;
}
