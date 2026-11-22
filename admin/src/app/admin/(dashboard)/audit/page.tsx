import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { DataTable, Empty, PageHeader } from "@/app/admin/_components/kit";
import { requireStaff } from "@/auth/guards";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@refnused/database/db";
import { listAudit } from "@/lib/admin/people";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change by staff, customers and the system. Newest first."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Audit searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Audit({ searchParams }: Pick<PageProps<"/admin/audit">, "searchParams">) {
  await requireStaff("audit.view", "/admin/audit");
  await connection();
  const params = await searchParams;
  const action =
    typeof params.action === "string" && /^[a-z_.]{1,60}$/.test(params.action)
      ? params.action
      : undefined;
  const rows = await listAudit(db, { action, limit: 300 });
  return (
    <>
      <form method="get" role="search" className="mb-4 flex flex-wrap gap-2">
        <label htmlFor="audit-action" className="sr-only">
          Action starts with
        </label>
        <input
          id="audit-action"
          name="action"
          defaultValue={action}
          placeholder="Action, e.g. price. or payout."
          className="h-11 w-full max-w-xs rounded-lg border border-input bg-background px-3 text-sm"
        />
        <button
          type="submit"
          className="h-11 rounded-lg border px-4 text-sm font-medium hover:bg-accent"
        >
          Filter
        </button>
      </form>
      {rows.length === 0 ? (
        <Empty>No entries.</Empty>
      ) : (
        <DataTable label="Audit log">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Who</th>
              <th scope="col">Action</th>
              <th scope="col">What</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="text-xs whitespace-nowrap text-muted-foreground">
                  {r.at.toLocaleString("en-GB", {
                    timeZone: "Europe/London",
                    dateStyle: "short",
                    timeStyle: "medium",
                  })}
                </td>
                <td>
                  {r.actorName ?? r.actorType}
                  <span className="block text-xs text-muted-foreground">{r.actorType}</span>
                </td>
                <td className="font-mono text-xs">{r.action}</td>
                <td className="text-xs">
                  {r.entityType}
                  <span className="block max-w-48 truncate font-mono text-muted-foreground">
                    {r.entityId}
                  </span>
                </td>
                <td>
                  {r.changes ? (
                    <details>
                      <summary className="cursor-pointer text-xs text-primary">Show</summary>
                      <pre className="mt-1 max-w-md overflow-x-auto text-xs whitespace-pre-wrap">
                        {JSON.stringify(r.changes, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </>
  );
}
