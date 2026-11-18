import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { PageHeader, StatusPill } from "@/app/admin/_components/kit";
import { requireStaff } from "@/auth/guards";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { formatOpeningHours } from "@/lib/stores";

export const metadata: Metadata = { title: "Stores" };

export default function StoresPage() {
  return (
    <>
      <PageHeader
        title="Stores"
        description="Addresses, phone numbers and opening hours shown on the website."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Stores />
      </Suspense>
    </>
  );
}

async function Stores() {
  await requireStaff("stores.manage", "/admin/stores");
  await connection();
  const rows = await db.select().from(stores).orderBy(asc(stores.name), asc(stores.town));
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((s) => {
        const hours = formatOpeningHours(s.openingHours);
        return (
          <li key={s.id} className="flex flex-col gap-2 rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">
                {s.name}, {s.town}
              </h2>
              {s.isActive ? null : <StatusPill status="hidden" />}
            </div>
            <p className="text-sm text-muted-foreground">
              {s.street}, {s.postcode}
            </p>
            <p className="text-sm">
              {hours
                ? hours.map((h) => `${h.days} ${h.hours}`).join(" · ")
                : "Opening hours not set"}
            </p>
            <Link
              href={`/admin/stores/${s.id}`}
              className="mt-auto inline-flex min-h-11 items-center text-sm font-medium text-primary underline"
            >
              Edit
              <span className="sr-only">
                {" "}
                {s.name}, {s.town}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
