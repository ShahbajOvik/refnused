"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type NavLinkProps = React.ComponentProps<typeof Link> & { href: string };

/** Link that marks itself with aria-current="page" when its section is active. */
export function NavLink({ href, className, ...props }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      data-active={isActive || undefined}
      className={cn(className)}
      {...props}
    />
  );
}
