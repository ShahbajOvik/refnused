import Link from "next/link";

import { cn } from "@/lib/utils";

/* Server-safe building blocks for admin pages (phone, tablet and desktop). */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Section({
  title,
  children,
  className,
  actions,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border bg-card p-4 sm:p-6", className)}>
      {title || actions ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title ? <h2 className="text-lg font-semibold">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  href?: string;
  tone?: "attention";
}) {
  const body = (
    <>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </>
  );
  const className = cn(
    "flex min-h-24 flex-col justify-between gap-2 rounded-xl border bg-card p-4",
    tone === "attention" && "border-primary",
    href &&
      "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
  );
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Tabs as links, so filters live in the URL. Scrolls sideways on phones. */
export function FilterTabs({
  label,
  tabs,
  current,
}: {
  label: string;
  tabs: { key: string; label: string; href: string; count?: number }[];
  current: string;
}) {
  return (
    <nav aria-label={label} className="-mx-1 mb-4 overflow-x-auto pb-1">
      <ul className="flex gap-1 px-1">
        {tabs.map((tab) => (
          <li key={tab.key} className="shrink-0">
            <Link
              href={tab.href}
              aria-current={tab.key === current ? "page" : undefined}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
            >
              {tab.label}
              {tab.count !== undefined ? (
                <span className="tabular-nums opacity-80">{tab.count}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SearchForm({
  action,
  defaultValue,
  placeholder,
}: {
  action: string;
  defaultValue?: string;
  placeholder: string;
}) {
  return (
    <form action={action} method="get" role="search" className="mb-4 flex gap-2">
      <label htmlFor="admin-search" className="sr-only">
        Search
      </label>
      <input
        id="admin-search"
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-11 w-full max-w-md rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      />
      <button
        type="submit"
        className="h-11 rounded-lg border px-4 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Search
      </button>
    </form>
  );
}

/**
 * A table that scrolls sideways on small screens (with a label for screen
 * readers) instead of squashing columns.
 */
export function DataTable({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn(
        "overflow-x-auto rounded-xl border bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm [&_td]:border-t [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top [&_th]:px-3 [&_th]:py-2.5 [&_th]:font-medium [&_th]:text-muted-foreground">
        <caption className="sr-only">{label}</caption>
        {children}
      </table>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">{children}</p>
  );
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span className="inline-flex rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap">
      {status.replace(/_/g, " ")}
    </span>
  );
}
