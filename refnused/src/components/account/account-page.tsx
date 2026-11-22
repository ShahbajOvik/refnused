import { Suspense } from "react";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";

/** Heading, breadcrumbs and a streamed body shared by account sub-pages. */
export function AccountPage({
  title,
  href,
  intro,
  children,
}: {
  title: string;
  href: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Your account", href: "/account" },
          { label: title, href },
        ]}
      />
      <h1 className="mt-6 text-3xl font-semibold">{title}</h1>
      {intro ? <p className="mt-2 max-w-2xl text-muted-foreground">{intro}</p> : null}
      <Suspense fallback={<Skeleton className="mt-6 h-64 w-full rounded-2xl" />}>
        {children}
      </Suspense>
    </>
  );
}
