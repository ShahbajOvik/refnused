import { MessageSquareQuoteIcon, StarIcon } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";

import { Reveal } from "@/components/motion/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { loadReviews } from "@/lib/catalogue/queries";
import { formatDate } from "@/lib/format";

import { SectionHeading } from "./section-heading";

/**
 * Shows moderated, published reviews from the database. Until there are
 * real reviews it shows an honest placeholder. Never add sample reviews.
 */
export function ReviewsSection() {
  return (
    <section
      aria-labelledby="reviews-heading"
      className="border-y bg-muted/40 py-(--spacing-section)"
    >
      <div className="page-container">
        <SectionHeading id="reviews-heading" eyebrow="Reviews" title="What our customers say" />
        <Suspense fallback={<Skeleton className="mt-10 h-48 rounded-2xl" />}>
          <ReviewList />
        </Suspense>
      </div>
    </section>
  );
}

async function ReviewList() {
  await connection();
  const reviews = await loadReviews();

  if (!reviews?.length) {
    return (
      <div className="mt-10 flex h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card p-8 text-center">
        <MessageSquareQuoteIcon className="size-8 text-primary" aria-hidden />
        <p className="max-w-md text-muted-foreground">
          We’re new, so reviews from our first customers will appear here soon.
        </p>
      </div>
    );
  }

  return (
    <ul className="mt-10 grid gap-6 md:grid-cols-3">
      {reviews.map((review, index) => (
        <Reveal
          as="li"
          key={review.id}
          delay={(index % 3) * 0.08}
          className="flex flex-col gap-3 rounded-2xl border bg-card p-6"
        >
          <p className="flex gap-0.5" role="img" aria-label={`${review.rating} out of 5 stars`}>
            {Array.from({ length: 5 }, (_, i) => (
              <StarIcon
                key={i}
                aria-hidden
                className={
                  i < review.rating
                    ? "size-4 fill-warning text-warning"
                    : "size-4 text-muted-foreground/40"
                }
              />
            ))}
          </p>
          {review.title ? <h3 className="font-semibold">{review.title}</h3> : null}
          <blockquote className="text-muted-foreground">{review.body}</blockquote>
          <p className="mt-auto text-sm">
            {review.displayName}
            {review.isVerified ? " · Verified customer" : ""}
            {review.publishedAt ? (
              <span className="text-muted-foreground"> · {formatDate(review.publishedAt)}</span>
            ) : null}
          </p>
        </Reveal>
      ))}
    </ul>
  );
}
