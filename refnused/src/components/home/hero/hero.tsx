import { ArrowRightIcon, BanknoteIcon, ShoppingBagIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { HeroVisual } from "./hero-visual";

const paths = [
  {
    key: "sell",
    href: "/sell",
    title: "Sell your phone",
    text: "Get an instant quote",
    icon: BanknoteIcon,
    primary: true,
  },
  {
    key: "buy",
    href: "/shop",
    title: "Buy refurbished",
    text: "Graded phones with a warranty",
    icon: ShoppingBagIcon,
    primary: false,
  },
] as const;

/**
 * Home hero. Server-rendered text and links paint first; the visual is a
 * static poster that may be upgraded to 3D after load. With motion allowed,
 * the section is taller and the content sticks while the phone splits
 * into the two paths. With reduced motion it's a normal, static section.
 */
export function Hero() {
  return (
    <section
      data-hero
      aria-labelledby="hero-heading"
      className="relative h-[175svh] motion-reduce:h-auto"
    >
      <div className="sticky top-(--spacing-header) flex h-[calc(100svh-var(--spacing-header))] min-h-[34rem] flex-col overflow-hidden bg-[radial-gradient(ellipse_at_50%_55%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_65%)] motion-reduce:static motion-reduce:h-auto motion-reduce:min-h-0">
        <div data-hero-intro className="page-container pt-8 text-center sm:pt-12">
          <p className="text-sm font-medium text-primary">
            Online, or in store in North and South Shields
          </p>
          <h1
            id="hero-heading"
            className="mx-auto mt-2 max-w-3xl text-4xl font-semibold sm:text-5xl lg:text-6xl"
          >
            Sell your phone. Or buy one refurbished.
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground sm:text-lg">
            Instant quotes for your old phone, and graded refurbished phones with a warranty.
          </p>
        </div>

        <div className="relative min-h-56 flex-1 motion-reduce:h-72 motion-reduce:flex-none">
          <HeroVisual />
        </div>

        <div className="page-container pt-2 pb-6 sm:pb-10">
          <ul className="mx-auto grid max-w-3xl grid-cols-2 gap-3 sm:gap-6">
            {paths.map((path) => (
              <li key={path.key}>
                <Link
                  href={path.href}
                  data-hero-path={path.key}
                  className={cn(
                    "group flex h-full flex-col gap-1 rounded-2xl border p-4 shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none sm:p-5",
                    path.primary
                      ? "border-transparent bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-card hover:bg-accent",
                  )}
                >
                  <path.icon className="size-6" aria-hidden />
                  <span className="mt-1 flex items-center gap-1 text-base font-semibold sm:text-lg">
                    {path.title}
                    <ArrowRightIcon
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </span>
                  <span
                    className={cn(
                      "text-sm",
                      path.primary ? "text-primary-foreground/90" : "text-muted-foreground",
                    )}
                  >
                    {path.text}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
