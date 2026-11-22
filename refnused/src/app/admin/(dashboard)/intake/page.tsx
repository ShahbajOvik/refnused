import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { Suspense } from "react";

import { PageHeader, Section } from "@/app/admin/_components/kit";
import { requireStaff } from "@/auth/guards";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { listCategoriesForIntake, listVariantsForIntake } from "@/lib/admin/intake";

import { IntakeForm } from "./intake-form";

export const metadata: Metadata = { title: "Device intake" };

export default function IntakePage() {
  return (
    <>
      <PageHeader
        title="Device intake"
        description="Add a checked item to stock. For phones, enter or scan the IMEI first: we’ll fill in what we know from its trade-in."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Intake />
      </Suspense>
    </>
  );
}

async function Intake() {
  await requireStaff("products.manage", "/admin/intake");
  await connection();
  const [categories, variants, storeRows] = await Promise.all([
    listCategoriesForIntake(db),
    listVariantsForIntake(db),
    db
      .select({ id: stores.id, name: stores.name, town: stores.town })
      .from(stores)
      .where(eq(stores.isActive, true))
      .orderBy(asc(stores.name), asc(stores.town)),
  ]);
  return (
    <Section>
      <IntakeForm
        categories={categories}
        variants={variants}
        stores={storeRows.map((s) => ({ id: s.id, label: `${s.name}, ${s.town}` }))}
      />
    </Section>
  );
}
