import { formatDate } from "@/lib/format";
import type { GuideAuthor } from "@/lib/guides/types";

/** Author and dates. Shown on every guide, matching the Article JSON-LD. */
export function GuideByline({
  author,
  publishedAt,
  updatedAt,
  live,
}: {
  author: GuideAuthor;
  publishedAt: string;
  updatedAt: string;
  /** Prices on the page are live: say "Prices updated" instead of "Updated". */
  live?: boolean;
}) {
  const published = new Date(publishedAt);
  const updated = new Date(updatedAt);
  const showUpdated = formatDate(updated) !== formatDate(published);
  return (
    <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <span>
        By <span className="font-medium text-foreground">{author.name}</span>
        {author.kind === "person" && author.role ? `, ${author.role}` : null}
      </span>
      <span>
        Published <time dateTime={published.toISOString()}>{formatDate(published)}</time>
      </span>
      {showUpdated ? (
        <span>
          {live ? "Prices updated" : "Updated"}{" "}
          <time dateTime={updated.toISOString()}>{formatDate(updated)}</time>
        </span>
      ) : null}
    </p>
  );
}
