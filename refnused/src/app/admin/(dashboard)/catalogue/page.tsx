import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { Empty, FilterTabs, PageHeader, Section, StatusPill } from "@/app/admin/_components/kit";
import { requireStaff } from "@/auth/guards";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { loadCatalogue, type CatalogueData } from "@/lib/admin/catalogue";

import {
  AddOptionsForm,
  EditCategoryForm,
  EditModelForm,
  NewBrandForm,
  NewCategoryForm,
  NewModelForm,
  VariantRow,
} from "./catalogue-forms";

export const metadata: Metadata = { title: "Catalogue" };

const IDENTIFIER_LABELS = {
  imei: "IMEI",
  serial: "Serial number",
  none: "Stock code",
} as const;

const summaryClass =
  "flex min-h-11 cursor-pointer items-center rounded-lg text-sm font-medium text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export default function CataloguePage({ searchParams }: PageProps<"/admin/catalogue">) {
  return (
    <>
      <PageHeader
        title="Catalogue"
        description="Add the categories, brands and models you sell. Then add each physical item with device intake."
        actions={
          <Button asChild className="min-h-11">
            <Link href="/admin/intake">Add stock</Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Catalogue searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Catalogue({ searchParams }: Pick<PageProps<"/admin/catalogue">, "searchParams">) {
  await requireStaff("catalogue.manage", "/admin/catalogue");
  await connection();
  const { category: requested } = await searchParams;
  const { categories, brands, models } = await loadCatalogue(db);
  const current = categories.find((c) => c.slug === requested) ?? categories[0];
  const shown = models.filter((m) => m.categoryId === current?.id);

  return (
    <div className="flex flex-col gap-6">
      <Section title="Categories">
        <ul className="mb-6 divide-y rounded-lg border">
          {categories.map((c) => (
            <CategoryRow key={c.id} category={c} />
          ))}
        </ul>
        <details>
          <summary className={summaryClass}>Add a category</summary>
          <div className="mt-4">
            <NewCategoryForm />
          </div>
        </details>
      </Section>

      <Section title="Brands">
        <ul className="mb-5 flex flex-wrap gap-2">
          {brands.map((b) => (
            <li key={b.id} className="rounded-full border px-3 py-1 text-sm">
              {b.name}
            </li>
          ))}
        </ul>
        <NewBrandForm />
      </Section>

      <Section title="Add a model">
        {brands.length ? (
          <NewModelForm categories={categories} brands={brands} defaultCategoryId={current?.id} />
        ) : (
          <p className="text-sm text-muted-foreground">Add a brand first.</p>
        )}
      </Section>

      <Section title="Models">
        <FilterTabs
          label="Models by category"
          current={current?.slug ?? ""}
          tabs={categories.map((c) => ({
            key: c.slug,
            label: c.name,
            href: `/admin/catalogue?category=${c.slug}`,
            count: c.modelCount,
          }))}
        />
        {shown.length === 0 ? (
          <Empty>No models in this category yet.</Empty>
        ) : (
          <ul className="divide-y rounded-lg border">
            {shown.map((m) => (
              <ModelRow key={m.id} model={m} hasStorage={current?.hasStorage ?? true} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function CategoryRow({ category: c }: { category: CatalogueData["categories"][number] }) {
  const needs = [
    IDENTIFIER_LABELS[c.identifierType],
    c.hasStorage ? "storage" : null,
    c.hasBattery ? "battery" : null,
    c.requiresDataWipe ? "data wipe" : null,
  ].filter(Boolean);
  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium">{c.name}</h3>
          <p className="text-xs text-muted-foreground">
            {c.modelCount} {c.modelCount === 1 ? "model" : "models"} · {needs.join(" · ")}
          </p>
        </div>
        {c.isActive ? null : <StatusPill status="hidden" />}
      </div>
      <details className="mt-1">
        <summary className={summaryClass}>
          Edit<span className="sr-only"> {c.name}</span>
        </summary>
        <div className="mt-3">
          <EditCategoryForm category={c} />
        </div>
      </details>
    </li>
  );
}

function ModelRow({
  model: m,
  hasStorage,
}: {
  model: CatalogueData["models"][number];
  hasStorage: boolean;
}) {
  const visible = m.variants.filter((v) => v.isActive).length;
  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium">
            {m.brand} {m.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {m.releaseYear} · {visible} {visible === 1 ? "option" : "options"}
          </p>
        </div>
        {m.isActive ? null : <StatusPill status="hidden" />}
      </div>
      <details className="mt-1">
        <summary className={summaryClass}>
          Manage<span className="sr-only"> {m.name}</span>
        </summary>
        <div className="mt-3 flex flex-col gap-6">
          <EditModelForm model={m} />
          <div>
            <h4 className="text-sm font-semibold">Options</h4>
            <ul className="mt-1 divide-y">
              {m.variants.map((v) => (
                <VariantRow key={v.id} variant={v} />
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-sm font-semibold">Add more options</h4>
            <AddOptionsForm model={m} hasStorage={hasStorage} />
          </div>
        </div>
      </details>
    </li>
  );
}
