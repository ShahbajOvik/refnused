"use client";

import { Loader2Icon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

type Result = {
  slug: string;
  name: string;
  brand: string;
  maxPricePence: number | null;
};

type Status = "idle" | "loading" | "done" | "error";

/**
 * Quick-quote search (WAI-ARIA combobox with a listbox popup).
 * Without JS it's a plain GET form to /sell?q=…
 */
export function QuickQuoteSearch() {
  const router = useRouter();
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const searchable = query.trim().length >= 2;
  const visible = searchable ? results : [];
  const expanded = open && searchable && (visible.length > 0 || status === "done");

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const response = await fetch(`/api/models/search?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as { results: Result[] };
        setResults(data.results);
        setActive(-1);
        setStatus("done");
      } catch {
        if (!controller.signal.aborted) setStatus("error");
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const choose = (result: Result) => {
    setOpen(false);
    router.push(`/sell/${result.slug}`);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && visible.length) {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % visible.length);
    } else if (event.key === "ArrowUp" && visible.length) {
      event.preventDefault();
      setActive((i) => (i <= 0 ? visible.length - 1 : i - 1));
    } else if (event.key === "Enter" && expanded && active >= 0 && visible[active]) {
      event.preventDefault();
      choose(visible[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };

  const announcement =
    status === "error"
      ? "Search isn’t working right now. Please try again."
      : status === "done" && searchable
        ? visible.length === 0
          ? "No matching phones."
          : `${visible.length} ${visible.length === 1 ? "phone" : "phones"} found.`
        : "";

  return (
    <form
      action="/sell"
      method="get"
      role="search"
      className="relative"
      onSubmit={() => setOpen(false)}
    >
      <label htmlFor={`${id}-input`} className="mb-2 block font-medium">
        Which phone are you selling?
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            ref={inputRef}
            id={`${id}-input`}
            name="q"
            type="search"
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. iPhone 15 or Galaxy S24"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKeyDown}
            className="h-12 w-full rounded-xl border border-input bg-background pr-10 pl-10 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          />
          {status === "loading" ? (
            <Loader2Icon
              className="absolute top-1/2 right-3 size-5 -translate-y-1/2 animate-spin text-muted-foreground"
              aria-hidden
            />
          ) : null}
        </div>
        <Button type="submit" size="lg" className="h-12 rounded-xl">
          Get a quote
        </Button>
      </div>

      <ul
        id={listId}
        role="listbox"
        aria-label="Matching phones"
        hidden={!expanded}
        className="absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-y-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
      >
        {visible.map((result, index) => (
          <li
            key={result.slug}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(result)}
            onMouseEnter={() => setActive(index)}
            className={cn(
              "flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-lg px-3 py-2",
              index === active && "bg-accent",
            )}
          >
            <span>
              <span className="text-muted-foreground">{result.brand}</span>{" "}
              <span className="font-medium">{result.name}</span>
            </span>
            {result.maxPricePence ? (
              <span className="text-sm whitespace-nowrap">
                Up to <strong>{formatPrice(result.maxPricePence, { whole: true })}</strong>
              </span>
            ) : null}
          </li>
        ))}
        {status === "done" && visible.length === 0 ? (
          <li role="option" aria-selected={false} aria-disabled className="px-3 py-3 text-sm">
            We couldn’t find that phone. Press <strong>Get a quote</strong> to see all models.
          </li>
        ) : null}
      </ul>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </form>
  );
}
