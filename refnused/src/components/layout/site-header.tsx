import { UserIcon } from "lucide-react";
import Link from "next/link";

import { BasketLink } from "@/components/checkout/basket-link";
import { Logo } from "@/components/layout/logo";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NavLink } from "@/components/layout/nav-link";
import { Button } from "@/components/ui/button";
import { mainNav } from "@refnused/database/config/site";
import { loadPublicStores } from "@/lib/stores-cache";

export async function SiteHeader() {
  const stores = (await loadPublicStores()).map(({ slug, name, address, phone, phoneDisplay }) => ({
    slug,
    name,
    address: { town: address.town },
    phone,
    phoneDisplay,
  }));
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="page-container flex h-(--spacing-header) items-center gap-4">
        <Logo />

        <nav aria-label="Main" className="ml-6 hidden md:block">
          <ul className="flex items-center gap-1">
            {mainNav.map((item) => (
              <li key={item.href}>
                <NavLink
                  href={item.href}
                  className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-active:text-foreground data-active:underline data-active:decoration-primary data-active:decoration-2 data-active:underline-offset-8"
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" className="hidden md:inline-flex">
            <Link href="/account" aria-label="Account">
              <UserIcon className="size-5" aria-hidden />
            </Link>
          </Button>
          <BasketLink />
          <MobileNav stores={stores} />
        </div>
      </div>
    </header>
  );
}
