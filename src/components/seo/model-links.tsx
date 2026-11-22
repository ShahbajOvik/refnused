import { BookOpenIcon, ChevronRightIcon, PoundSterlingIcon, ShoppingBagIcon } from "lucide-react";
import Link from "next/link";

import { cachedGuideSummaries, cachedModelLinkTargets } from "@/lib/guides/queries";
import { type InternalLink, modelLinks } from "@/lib/internal-links";
import { orFallback } from "@/lib/shop/load";
import { cn } from "@/lib/utils";

const ICONS = { sell: PoundSterlingIcon, shop: ShoppingBagIcon, guide: BookOpenIcon };

type ModelLinksProps = {
  /** Model slugs, most relevant first. */
  models: string[];
  /** Path of the current page, so it doesn't link to itself. */
  currentPath: string;
  heading?: string;
  className?: string;
};

/**
 * "More about the iPhone 15": links to the sell page, shop listing and
 * guides for each model. Server Component; renders nothing if there are none.
 */
export async function ModelLinks({ models, currentPath, heading, className }: ModelLinksProps) {
  if (!models.length) return null;
  const [targets, guides] = await Promise.all([
    orFallback("model links", () => cachedModelLinkTargets(models), []),
    orFallback("guide summaries", cachedGuideSummaries, []),
  ]);
  const groups = targets
    .map((model) => ({ model, links: modelLinks(model, { guides, exclude: currentPath }) }))
    .filter((g) => g.links.length);
  if (!groups.length) return null;

  const title =
    heading ??
    (groups.length === 1
      ? `More about the ${groups[0]!.model.brandName} ${groups[0]!.model.name}`
      : "Models in this guide");

  return (
    <section
      aria-labelledby="model-links-heading"
      className={cn("rounded-2xl border p-6", className)}
    >
      <h2 id="model-links-heading" className="text-xl font-semibold">
        {title}
      </h2>
      <div className={cn("mt-4 grid gap-6", groups.length > 1 && "md:grid-cols-2")}>
        {groups.map(({ model, links }) => (
          <div key={model.slug}>
            {groups.length > 1 ? (
              <h3 className="mb-2 font-medium">
                {model.brandName} {model.name}
              </h3>
            ) : null}
            <ul className="flex flex-col gap-1">
              {links.map((link) => (
                <li key={link.href}>
                  <LinkRow link={link} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function LinkRow({ link }: { link: InternalLink }) {
  const Icon = ICONS[link.kind];
  return (
    <Link
      href={link.href}
      className="group flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Icon className="size-5 shrink-0 text-primary" aria-hidden />
      <span className="flex-1">
        <span className="font-medium underline-offset-4 group-hover:underline">{link.label}</span>
        {link.detail ? (
          <span className="block text-sm text-muted-foreground">{link.detail}</span>
        ) : null}
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
