import { ExternalLinkIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { PageHeader, Section } from "@/app/admin/_components/kit";
import { requireStaff } from "@/auth/guards";
import { Skeleton } from "@/components/ui/skeleton";
import { serverEnv } from "@refnused/database/lib/env.server";

export const metadata: Metadata = { title: "Content" };

/** Sanity Studio areas. Paths follow the Studio's desk structure; adjust if it changes. */
const AREAS = [
  {
    path: "/structure/page",
    label: "Pages",
    description: "Help, returns, warranty and other pages",
  },
  {
    path: "/structure/faq",
    label: "FAQs",
    description: "Questions on the home page and help centre",
  },
  {
    path: "/structure/banner",
    label: "Banners",
    description: "Offers and notices shown across the site",
  },
  { path: "/structure/post", label: "Guides and news", description: "Articles and buying guides" },
  { path: "/media", label: "Images", description: "Photos and graphics used in content" },
];

export default function ContentPage() {
  return (
    <>
      <PageHeader
        title="Content"
        description="Website text and pages are edited in Sanity Studio."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requireStaff("content.edit", "/admin/content");
  await connection();
  const studio = serverEnv.SANITY_STUDIO_URL?.replace(/\/+$/, "");
  if (!studio) {
    return (
      <Section>
        <p className="text-sm">
          Sanity Studio isn’t connected yet. Set{" "}
          <code className="rounded bg-muted px-1">SANITY_STUDIO_URL</code> to the Studio’s address
          and its sections will appear here.
        </p>
      </Section>
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {AREAS.map((a) => (
        <li key={a.path}>
          <a
            href={`${studio}${a.path}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-full flex-col gap-1 rounded-xl border bg-card p-5 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="flex items-center gap-2 font-semibold">
              {a.label} <ExternalLinkIcon className="size-4" aria-hidden />
              <span className="sr-only">(opens Sanity Studio in a new tab)</span>
            </span>
            <span className="text-sm text-muted-foreground">{a.description}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
