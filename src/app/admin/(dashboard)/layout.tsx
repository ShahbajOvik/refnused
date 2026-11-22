import { LogOutIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { signOutStaff } from "@/app/admin/sign-in/actions";
import { requireStaff } from "@/auth/guards";
import { can, ROLE_LABELS, type Permission } from "@/auth/roles";
import { LogoMark } from "@/components/layout/logo";
import { NavLink } from "@/components/layout/nav-link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { siteConfig } from "@/config/site";

/** Admin sections, in menu order, with the permission each needs. */
const SECTIONS: { href: string; label: string; permission: Permission; exact?: boolean }[] = [
  { href: "/admin", label: "Dashboard", permission: "admin.access", exact: true },
  { href: "/admin/quotes", label: "Trade-ins", permission: "quotes.manage" },
  { href: "/admin/payouts", label: "Payouts", permission: "payouts.approve" },
  { href: "/admin/intake", label: "Device intake", permission: "products.manage" },
  { href: "/admin/products", label: "Products", permission: "products.manage" },
  { href: "/admin/catalogue", label: "Catalogue", permission: "catalogue.manage" },
  { href: "/admin/orders", label: "Orders", permission: "orders.manage" },
  { href: "/admin/returns", label: "Returns & warranty", permission: "orders.manage" },
  { href: "/admin/prices", label: "Prices", permission: "prices.update" },
  { href: "/admin/customers", label: "Customers", permission: "customers.view" },
  { href: "/admin/stores", label: "Stores", permission: "stores.manage" },
  { href: "/admin/content", label: "Content", permission: "content.edit" },
  { href: "/admin/staff", label: "Staff", permission: "staff.manage" },
  { href: "/admin/audit", label: "Audit log", permission: "audit.view" },
  { href: "/admin/security", label: "Security", permission: "admin.access" },
];

/**
 * Signed-in admin chrome. The session check here only decides what the
 * menu shows; every page and action under /admin checks its own
 * permission too, because layouts don't re-run on every navigation.
 */
export default function AdminDashboardLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="page-container flex h-14 items-center gap-3">
          <Link
            href="/admin"
            className="flex items-center gap-2 rounded-md font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <LogoMark className="size-7" />
            <span className="hidden sm:inline">{siteConfig.name}</span>
            <span className="font-normal text-muted-foreground">admin</span>
          </Link>
          <Suspense fallback={<Skeleton className="ml-auto h-9 w-40" />}>
            <StaffMenu />
          </Suspense>
        </div>
        {/* Phones and tablets: sections scroll sideways under the header. */}
        <Suspense fallback={<div className="h-12 lg:hidden" />}>
          <SectionNav variant="bar" />
        </Suspense>
      </header>
      <div className="page-container flex flex-1 gap-8 py-6 lg:py-8">
        <aside className="hidden w-52 shrink-0 lg:block">
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <SectionNav variant="sidebar" />
          </Suspense>
        </aside>
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          {children}
        </main>
      </div>
    </>
  );
}

async function StaffMenu() {
  const { staff } = await requireStaff("admin.access");
  return (
    <div className="ml-auto flex items-center gap-2">
      <span className="hidden text-sm text-muted-foreground md:inline">
        {staff.name} · {ROLE_LABELS[staff.role]}
      </span>
      <form action={signOutStaff}>
        <Button type="submit" variant="outline" size="sm" className="min-h-10">
          <LogOutIcon aria-hidden />
          Sign out
        </Button>
      </form>
    </div>
  );
}

async function SectionNav({ variant }: { variant: "bar" | "sidebar" }) {
  const { staff } = await requireStaff("admin.access");
  const sections = SECTIONS.filter((s) => can(staff.role, s.permission));
  const linkClass =
    "flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-active:bg-accent data-active:text-foreground";
  if (variant === "bar") {
    return (
      <nav aria-label="Admin sections" className="border-t lg:hidden">
        <ul className="page-container flex gap-1 overflow-x-auto py-1">
          {sections.map((s) => (
            <li key={s.href} className="shrink-0">
              <NavLink href={s.href} exact={s.exact} className={linkClass}>
                {s.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    );
  }
  return (
    <nav aria-label="Admin sections" className="sticky top-20">
      <ul className="flex flex-col gap-0.5">
        {sections.map((s) => (
          <li key={s.href}>
            <NavLink href={s.href} exact={s.exact} className={linkClass}>
              {s.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
