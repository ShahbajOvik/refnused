import { ArrowRightIcon, PlusIcon, ShoppingBagIcon, TrashIcon } from "lucide-react";
import type { Metadata } from "next";

import { ToastDemo } from "@/app/(site)/styleguide/demos";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { Badge, GradeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { GRADE_INFO, GRADES } from "@/lib/grades";
import { formatDate, formatPrice } from "@/lib/format";

export const metadata: Metadata = {
  title: "Styleguide",
  description: "RefurbednUsed design system: tokens and components.",
  robots: { index: false, follow: false, nocache: true },
  alternates: { canonical: "/styleguide" },
};

const colourTokens = [
  {
    name: "primary",
    note: "Brand accent: actions only",
    bg: "bg-primary",
    fg: "text-primary-foreground",
  },
  { name: "background", bg: "bg-background", fg: "text-foreground" },
  { name: "card", bg: "bg-card", fg: "text-card-foreground" },
  { name: "secondary", bg: "bg-secondary", fg: "text-secondary-foreground" },
  { name: "muted", bg: "bg-muted", fg: "text-muted-foreground" },
  { name: "accent", note: "Neutral hover surface", bg: "bg-accent", fg: "text-accent-foreground" },
  { name: "success", bg: "bg-success", fg: "text-success-foreground" },
  { name: "warning", bg: "bg-warning", fg: "text-warning-foreground" },
  { name: "destructive", bg: "bg-destructive", fg: "text-destructive-foreground" },
  { name: "grade-a", bg: "bg-grade-a", fg: "text-grade-a-foreground" },
  { name: "grade-b", bg: "bg-grade-b", fg: "text-grade-b-foreground" },
  { name: "grade-c", bg: "bg-grade-c", fg: "text-grade-c-foreground" },
];

const spacingScale = [1, 2, 3, 4, 6, 8, 12, 16];

const radiusScale = [
  { name: "sm", className: "rounded-sm" },
  { name: "md", className: "rounded-md" },
  { name: "lg", className: "rounded-lg" },
  { name: "xl", className: "rounded-xl" },
  { name: "2xl", className: "rounded-2xl" },
  { name: "full", className: "rounded-full" },
];

const typeScale = [
  { className: "text-5xl font-semibold", label: "text-5xl / Display" },
  { className: "text-4xl font-semibold", label: "text-4xl / H1" },
  { className: "text-3xl font-semibold", label: "text-3xl / H2" },
  { className: "text-2xl font-semibold", label: "text-2xl / H3" },
  { className: "text-xl font-medium", label: "text-xl / H4" },
  { className: "text-base", label: "text-base / Body" },
  { className: "text-sm text-muted-foreground", label: "text-sm / Secondary" },
];

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-t py-10 first-of-type:border-t-0">
      <h2 id={id} className="text-2xl font-semibold">
        {title}
      </h2>
      {description ? <p className="mt-1 text-muted-foreground">{description}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function StyleguidePage() {
  return (
    <div className="page-container py-8">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Styleguide", href: "/styleguide" },
        ]}
      />
      <header className="mt-6 max-w-prose-page">
        <h1 className="text-4xl font-semibold">Styleguide</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Design tokens and base components. This page is not indexed by search engines. Use the
          theme toggle in the footer to check dark mode.
        </p>
      </header>

      <Section
        id="colours"
        title="Colour"
        description="One brand accent for actions. Everything else is neutral. All pairs meet WCAG 2.2 AA."
      >
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {colourTokens.map((token) => (
            <li key={token.name} className="overflow-hidden rounded-lg border">
              <div className={`flex h-20 items-end p-3 ${token.bg} ${token.fg}`}>
                <span className="text-sm font-medium">Aa</span>
              </div>
              <div className="p-3 text-sm">
                <p className="font-mono font-medium">{token.name}</p>
                {token.note ? <p className="text-muted-foreground">{token.note}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="typography" title="Typography" description="Geist, loaded with next/font.">
        <ul className="flex flex-col gap-4">
          {typeScale.map((item) => (
            <li
              key={item.label}
              className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6"
            >
              <span className="w-48 shrink-0 font-mono text-xs text-muted-foreground">
                {item.label}
              </span>
              <span className={item.className}>Refurbished iPhone 15</span>
            </li>
          ))}
        </ul>
        <dl className="mt-6 grid gap-2 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="text-muted-foreground">Price (en-GB, GBP)</dt>
          <dd className="font-medium">{formatPrice(129900)}</dd>
          <dt className="text-muted-foreground">Date (long)</dt>
          <dd className="font-medium">{formatDate(new Date(Date.UTC(2026, 10, 17)))}</dd>
          <dt className="text-muted-foreground">Date (short)</dt>
          <dd className="font-medium">{formatDate(new Date(Date.UTC(2026, 10, 17)), "short")}</dd>
        </dl>
      </Section>

      <Section
        id="spacing"
        title="Spacing"
        description="4px base unit. Use the Tailwind scale: p-4 = 16px."
      >
        <ul className="flex flex-col gap-2">
          {spacingScale.map((step) => (
            <li key={step} className="flex items-center gap-4 text-sm">
              <span className="w-24 font-mono text-muted-foreground">
                {step} · {step * 4}px
              </span>
              <span className="h-3 rounded-sm bg-primary" style={{ width: `${step * 4}px` }} />
            </li>
          ))}
        </ul>
      </Section>

      <Section id="radius" title="Radius" description="Base radius 12px (rounded-lg).">
        <ul className="flex flex-wrap gap-4">
          {radiusScale.map((r) => (
            <li key={r.name} className="flex flex-col items-center gap-2 text-sm">
              <span className={`size-16 border-2 border-primary bg-muted ${r.className}`} />
              <span className="font-mono text-muted-foreground">{r.name}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="buttons"
        title="Button"
        description="Use the primary (brand) variant for one main action per section."
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Get a quote</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">
              <TrashIcon aria-hidden />
              Remove
            </Button>
            <Button variant="link">Link</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button>Default</Button>
            <Button size="lg">
              Large
              <ArrowRightIcon aria-hidden />
            </Button>
            <Button size="icon-sm" variant="outline" aria-label="Add">
              <PlusIcon aria-hidden />
            </Button>
            <Button size="icon" variant="outline" aria-label="Add">
              <PlusIcon aria-hidden />
            </Button>
            <Button size="icon-lg" aria-label="Basket">
              <ShoppingBagIcon aria-hidden />
            </Button>
          </div>
        </div>
      </Section>

      <Section
        id="badges"
        title="Badge"
        description="Grade badges always spell out the grade, so meaning never depends on colour alone."
      >
        <div className="flex flex-col gap-6">
          <ul className="grid gap-3 sm:grid-cols-3">
            {GRADES.map((grade) => (
              <li key={grade} className="flex flex-col items-start gap-2 rounded-lg border p-4">
                <GradeBadge grade={grade} />
                <p className="text-sm text-muted-foreground">{GRADE_INFO[grade].description}</p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            {GRADES.map((grade) => (
              <GradeBadge key={grade} grade={grade} showLabel={false} />
            ))}
            <Badge>New</Badge>
            <Badge variant="secondary">128GB</Badge>
            <Badge variant="outline">Unlocked</Badge>
            <Badge variant="success">In stock</Badge>
            <Badge variant="warning">Low stock</Badge>
            <Badge variant="destructive">Sold out</Badge>
          </div>
        </div>
      </Section>

      <Section id="cards" title="Card">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <GradeBadge grade="A" />
              </div>
              <CardTitle className="mt-2 text-lg">iPhone 15, 128GB</CardTitle>
              <CardDescription>Black · Unlocked · 12-month warranty</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{formatPrice(52900)}</p>
            </CardContent>
            <CardFooter>
              <Button className="w-full">Add to basket</Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your trade-in quote</CardTitle>
              <CardDescription>Samsung Galaxy S24 · Good condition</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{formatPrice(31000)}</p>
              <p className="mt-1 text-sm text-muted-foreground">Price held for 14 days</p>
            </CardContent>
            <CardFooter className="gap-2">
              <Button variant="outline" className="flex-1">
                Edit
              </Button>
              <Button className="flex-1">Accept</Button>
            </CardFooter>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Small card</CardTitle>
              <CardDescription>Compact spacing for dense lists.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">Card content goes here.</CardContent>
          </Card>
        </div>
      </Section>

      <Section id="forms" title="Input and Select">
        <form className="grid max-w-xl gap-5" action="#">
          <div className="grid gap-2">
            <Label htmlFor="sg-email">Email address</Label>
            <Input
              id="sg-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.co.uk"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sg-postcode">Postcode</Label>
            <Input
              id="sg-postcode"
              autoComplete="postal-code"
              aria-invalid
              aria-describedby="sg-postcode-error"
              defaultValue="NE29"
            />
            <p id="sg-postcode-error" className="text-sm text-destructive">
              Enter a full UK postcode, for example NE29 6RR.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sg-disabled">Disabled</Label>
            <Input id="sg-disabled" disabled placeholder="Not editable" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sg-storage">Storage</Label>
            <Select defaultValue="128">
              <SelectTrigger id="sg-storage" className="w-full sm:w-64">
                <SelectValue placeholder="Choose storage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="64">64GB</SelectItem>
                <SelectItem value="128">128GB</SelectItem>
                <SelectItem value="256">256GB</SelectItem>
                <SelectItem value="512">512GB</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </form>
      </Section>

      <Section id="dialog" title="Dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove from basket?</DialogTitle>
              <DialogDescription>
                iPhone 15, 128GB, Grade A will be removed. You can add it again later if it’s still
                in stock.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Keep item</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="destructive">Remove</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      <Section id="toast" title="Toast">
        <ToastDemo />
      </Section>

      <Section id="skeleton" title="Skeleton" description="Placeholder while content loads.">
        <div className="grid gap-4 sm:grid-cols-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-3 rounded-xl border p-4">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="breadcrumbs"
        title="Breadcrumbs"
        description="Every public page has these, plus BreadcrumbList JSON-LD."
      >
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Shop", href: "/shop" },
            { label: "Apple", href: "/shop/apple" },
            { label: "iPhone 15", href: "/shop/apple/iphone-15" },
          ]}
        />
      </Section>
    </div>
  );
}
