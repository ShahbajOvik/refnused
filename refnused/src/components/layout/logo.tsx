import Link from "next/link";

import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <rect
        x="10.5"
        y="6"
        width="11"
        height="20"
        rx="2.5"
        fill="none"
        strokeWidth="2"
        className="stroke-primary-foreground"
      />
      <path
        d="M13 14.5l2.2 2.2 4-4.2"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-foreground"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label={`${siteConfig.name} home`}
      className={cn(
        "inline-flex items-center gap-2 rounded-md font-heading text-lg font-semibold tracking-tight focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
        className,
      )}
    >
      <LogoMark />
      <span>
        Refurbed<span className="text-primary">n</span>Used
      </span>
    </Link>
  );
}
