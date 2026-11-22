import type { Metadata } from "next";

import { Announcer } from "@/components/account/announcer";
import { NavLink } from "@/components/layout/nav-link";
import { renderPerRequest } from "@refnused/database/lib/security/per-request";

const ACCOUNT_NAV = [
  { href: "/account", label: "Overview", exact: true },
  { href: "/account/quotes", label: "Trade-ins" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/payout", label: "Payout details" },
  { href: "/account/alerts", label: "Alerts" },
  { href: "/account/privacy", label: "Privacy and data" },
];

/** Never indexed. Pages set their own titles; this keeps new pages private by default. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Rendered per request for its nonce CSP (src/lib/security/per-request.ts). */
export const instant = false;

/** Account pages share a side menu. Each page checks the session itself. */
export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  await renderPerRequest();
  return (
    <div className="page-container grid gap-8 py-8 lg:grid-cols-[14rem_1fr]">
      <nav aria-label="Account" className="lg:pt-24">
        <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {ACCOUNT_NAV.map((item) => (
            <li key={item.href} className="shrink-0">
              <NavLink
                href={item.href}
                exact={item.exact}
                className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-active:bg-accent data-active:text-foreground"
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        <Announcer />
        {children}
      </div>
    </div>
  );
}
