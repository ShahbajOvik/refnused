import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { ActionButton } from "@/app/admin/_components/action-button";
import { PageHeader, Section, StatusPill } from "@/app/admin/_components/kit";
import { requireStaff } from "@/auth/guards";
import { can } from "@/auth/roles";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@refnused/database/db";
import { getQuoteDetail } from "@refnused/database/lib/admin/quotes";
import { formatDate, formatPrice } from "@refnused/database/lib/format";
import { mediaUrl } from "@refnused/database/lib/media";

import { markReceivedAction, markReturnedAction } from "../actions";
import { InspectionForm } from "./inspection-form";

export const metadata: Metadata = { title: "Trade-in" };

export default function QuotePage({ params }: PageProps<"/admin/quotes/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Quote params={params} />
    </Suspense>
  );
}

async function Quote({ params }: Pick<PageProps<"/admin/quotes/[id]">, "params">) {
  const { staff } = await requireStaff("quotes.manage", "/admin/quotes");
  await connection();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const q = await getQuoteDetail(db, id);
  if (!q) notFound();
  const canInspect =
    can(staff.role, "inspections.manage") &&
    ["accepted", "received", "inspecting"].includes(q.status);
  const declined = q.inspections.some((i) => i.revisedOfferStatus === "declined");
  const answers = Object.entries(q.answers.responses);

  return (
    <>
      <Link
        href="/admin/quotes"
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        ← Trade-ins
      </Link>
      <PageHeader
        title={`${q.reference}: ${q.device}`}
        description={
          <>
            <StatusPill status={q.status} /> · Offer {formatPrice(q.offeredPricePence)} (grade{" "}
            {q.quotedGrade}) · Price locked until {formatDate(q.priceLockedUntil)}
          </>
        }
        actions={
          <>
            {q.status === "accepted" ? (
              <ActionButton
                action={markReceivedAction}
                input={{ quoteId: q.id }}
                success="Marked as received."
              >
                Mark received
              </ActionButton>
            ) : null}
            {q.status === "rejected" || (q.status === "revised" && declined) ? (
              <ActionButton
                action={markReturnedAction}
                input={{ quoteId: q.id }}
                success="Marked as returned to the customer."
                variant="outline"
                confirm="Has the phone been posted back to the customer?"
              >
                Mark returned to customer
              </ActionButton>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          {canInspect ? (
            <Section title="Inspection">
              <InspectionForm
                quoteId={q.id}
                device={q.device}
                offeredPence={q.offeredPricePence}
                gradePrices={q.gradePrices}
                quotedGrade={q.quotedGrade}
              />
            </Section>
          ) : null}

          <Section title="Inspections">
            {q.inspections.length ? (
              <ol className="flex flex-col gap-4">
                {q.inspections.map((i) => (
                  <li key={i.id} className="rounded-lg border p-4 text-sm">
                    <p className="font-medium">
                      {formatDate(i.inspectedAt)} · grade {i.actualGrade} · CheckMEND{" "}
                      {i.checkmendResult ?? "not run"}
                      {i.checkmendReference ? ` (${i.checkmendReference})` : ""}
                    </p>
                    {i.revisedPricePence !== null ? (
                      <p>
                        Revised to {formatPrice(i.revisedPricePence)} · customer:{" "}
                        {i.revisedOfferStatus}
                      </p>
                    ) : null}
                    {i.notes ? <p className="mt-1 text-muted-foreground">{i.notes}</p> : null}
                    {i.photos.length ? (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {i.photos.map((p) => (
                          <li key={p.key}>
                            <a href={mediaUrl(p.key)} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
                              <img
                                src={mediaUrl(p.key)}
                                alt={p.alt}
                                className="size-20 rounded-lg border object-cover"
                              />
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">Not inspected yet.</p>
            )}
          </Section>
        </div>

        <div className="flex flex-col gap-6">
          <Section title="Customer">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{q.contactName ?? "—"}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="break-all">{q.contactEmail ?? "—"}</dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{q.contactPhone ?? "—"}</dd>
              <dt className="text-muted-foreground">IMEI</dt>
              <dd className="font-mono">{q.imei ?? "—"}</dd>
            </dl>
            {q.customerId ? (
              <Link
                href={`/admin/customers/${q.customerId}`}
                className="mt-3 inline-block text-sm text-primary underline-offset-4 hover:underline"
              >
                View customer
              </Link>
            ) : null}
          </Section>
          <Section title="Customer’s answers">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {answers.map(([question, answer]) => (
                <div key={question} className="contents">
                  <dt className="text-muted-foreground">{question.replace(/_/g, " ")}</dt>
                  <dd>{String(answer).replace(/_/g, " ")}</dd>
                </div>
              ))}
            </dl>
          </Section>
          <Section title="Payout">
            {q.payout ? (
              <p className="text-sm">
                {formatPrice(q.payout.amountPence)} · {q.payout.method.replace("_", " ")} ·{" "}
                <StatusPill status={q.payout.status} />
                {q.payout.last4 ? (
                  <span className="block text-muted-foreground">
                    Account ending {q.payout.last4}
                  </span>
                ) : null}
                {q.payout.paidAt ? (
                  <span className="block text-muted-foreground">
                    Paid {formatDate(q.payout.paidAt)}
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No payout.</p>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
