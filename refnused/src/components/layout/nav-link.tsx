"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { cn } from "@/lib/utils";

type NavLinkProps = React.ComponentProps<typeof Link> & {
  href: string;
  /** Only active on this exact path (not its sub-pages). */
  exact?: boolean;
};

function ActiveNavLink({ href, className, exact, ...props }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href || (!exact && pathname.startsWith(`${href}/`));

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

/**
 * Link that marks itself with aria-current="page" when its section is
 * active. The pathname is request data on dynamic routes, so the plain link
 * renders first (in the static shell) and gains its active state after.
 */
export function NavLink(props: NavLinkProps) {
  const linkProps: Omit<NavLinkProps, "exact"> = { ...props };
  delete (linkProps as NavLinkProps).exact;
  return (
    <Suspense fallback={<Link {...linkProps} />}>
      <ActiveNavLink {...props} />
    </Suspense>
  );
}
