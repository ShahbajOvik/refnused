import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { PageHeader, Section } from "@/app/admin/_components/kit";
import { requireStaff } from "@/auth/guards";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { mediaUrl } from "@/lib/media";

import { StoreForm } from "../store-form";

export const metadata: Metadata = { title: "Edit store" };

export default function StorePage({ params }: PageProps<"/admin/stores/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Store params={params} />
    </Suspense>
  );
}

async function Store({ params }: Pick<PageProps<"/admin/stores/[id]">, "params">) {
  await requireStaff("stores.manage", "/admin/stores");
  await connection();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [store] = await db.select().from(stores).where(eq(stores.id, id));
  if (!store) notFound();
  return (
    <>
      <Link
        href="/admin/stores"
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        ← Stores
      </Link>
      <PageHeader title={`${store.name}, ${store.town}`} />
      <Section>
        <StoreForm
          store={{
            id: store.id,
            name: store.name,
            street: store.street,
            town: store.town,
            postcode: store.postcode,
            phone: store.phone,
            email: store.email,
            latitude: store.latitude,
            longitude: store.longitude,
            isActive: store.isActive,
            openingHours: store.openingHours,
            parkingInfo: store.parkingInfo,
            nearestMetro: store.nearestMetro,
            photos: store.photos.map((p) => ({
              key: p.key,
              alt: p.alt,
              url: mediaUrl(p.key),
              name: p.key.split("/").at(-1)!,
            })),
          }}
        />
      </Section>
    </>
  );
}
