"use client";

import { MenuIcon, PhoneIcon, ShoppingBagIcon, UserIcon } from "lucide-react";

import { NavLink } from "@/components/layout/nav-link";
import { LogoMark } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { mainNav, stores } from "@/config/site";
import { telHref } from "@/lib/format";

const itemClass =
  "flex min-h-12 items-center gap-3 rounded-lg px-3 text-base font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-active:bg-accent data-active:text-primary";

export function MobileNav() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <MenuIcon className="size-6" aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-sm overflow-y-auto p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2">
            <LogoMark className="size-7" />
            Menu
          </SheetTitle>
          <SheetDescription className="sr-only">Main site navigation</SheetDescription>
        </SheetHeader>

        <nav aria-label="Mobile" className="px-2">
          <ul className="flex flex-col gap-1">
            {mainNav.map((item) => (
              <li key={item.href}>
                <SheetClose asChild>
                  <NavLink
                    href={item.href}
                    className={`${itemClass} flex-col items-start justify-center gap-0 py-2`}
                  >
                    <span>{item.label}</span>
                    {item.description ? (
                      <span className="text-sm font-normal text-muted-foreground">
                        {item.description}
                      </span>
                    ) : null}
                  </NavLink>
                </SheetClose>
              </li>
            ))}
          </ul>

          <Separator className="my-3" />

          <ul className="flex flex-col gap-1">
            <li>
              <SheetClose asChild>
                <NavLink href="/account" className={itemClass}>
                  <UserIcon className="size-5" aria-hidden />
                  Account
                </NavLink>
              </SheetClose>
            </li>
            <li>
              <SheetClose asChild>
                <NavLink href="/basket" className={itemClass}>
                  <ShoppingBagIcon className="size-5" aria-hidden />
                  Basket
                </NavLink>
              </SheetClose>
            </li>
          </ul>
        </nav>

        <div className="mt-auto border-t px-4 py-4">
          <p className="mb-2 text-sm font-medium">Call a store</p>
          <ul className="flex flex-col gap-1 text-sm">
            {stores.map((store) => (
              <li key={store.slug}>
                <a
                  href={telHref(store.phone)}
                  className="flex min-h-11 items-center gap-2 rounded-md px-2 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <PhoneIcon className="size-4 text-muted-foreground" aria-hidden />
                  <span>
                    {store.name}, {store.address.town}:{" "}
                    <span className="font-medium">{store.phoneDisplay}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
