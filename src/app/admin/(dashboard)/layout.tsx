import { LogOutIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { signOutStaff } from "@/app/admin/sign-in/actions";
import { requireStaff } from "@/auth/guards";
import { can, ROLE_LABELS } from "@/auth/roles";
import { LogoMark } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { siteConfig } from "@/config/site";

/**
 * Signed-in admin chrome. The session check here is for the header only;
 * every page and action under /admin checks its own permission too,
 * because layouts don't re-run on every navigation.
 */
export default function AdminDashboardLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <header className="border-b bg-background">
        <div className="page-container flex h-16 items-center gap-4">
          <Link
            href="/admin"
            className="flex items-center gap-2 rounded-md font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <LogoMark className="size-7" />
            {siteConfig.name} <span className="font-normal text-muted-foreground">admin</span>
          </Link>
          <Suspense fallback={<Skeleton className="ml-auto h-9 w-48" />}>
            <AdminNav />
          </Suspense>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1 py-8 focus:outline-none">
        <div className="page-container">{children}</div>
      </main>
    </>
  );
}

async function AdminNav() {
  const { staff } = await requireStaff("admin.access");
  const links = [
    { href: "/admin", label: "Dashboard", show: true },
    { href: "/admin/staff", label: "Staff", show: can(staff.role, "staff.manage") },
    { href: "/admin/security", label: "Security", show: true },
  ].filter((l) => l.show);

  return (
    <div className="ml-auto flex items-center gap-2">
      <nav aria-label="Admin" className="hidden sm:block">
        <ul className="flex gap-1">
          {links.map((link) => (
            <li key={link.href}>
              <Button asChild variant="ghost" size="sm">
                <Link href={link.href}>{link.label}</Link>
              </Button>
            </li>
          ))}
        </ul>
      </nav>
      <span className="hidden text-sm text-muted-foreground md:inline">
        {staff.name} · {ROLE_LABELS[staff.role]}
      </span>
      <form action={signOutStaff}>
        <Button type="submit" variant="outline" size="sm">
          <LogOutIcon aria-hidden />
          Sign out
        </Button>
      </form>
    </div>
  );
}
