import { PortableText, type PortableTextComponents } from "@portabletext/react";
import Image from "next/image";
import Link from "next/link";

import type { GuideBlocks } from "@refnused/database/lib/guides/types";

/*
 * Renders guide copy from Sanity. Headings start at h2 (the page has the h1).
 * Links are checked: only relative, http(s), mailto and tel URLs are rendered,
 * so editor content can't inject javascript: links. Images only from Sanity's CDN.
 */

const linkClass = "font-medium text-primary underline underline-offset-4";

export function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const value = href.trim();
  if (/^\/(?!\/)/.test(value) || value.startsWith("#")) return value;
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

type ImageValue = {
  url?: unknown;
  alt?: unknown;
  width?: unknown;
  height?: unknown;
  caption?: unknown;
};

const components: PortableTextComponents = {
  block: {
    normal: ({ children }) => <p className="mt-4 leading-7">{children}</p>,
    h1: ({ children }) => <h2 className="mt-10 text-2xl font-semibold">{children}</h2>,
    h2: ({ children }) => <h2 className="mt-10 text-2xl font-semibold">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-8 text-xl font-semibold">{children}</h3>,
    h4: ({ children }) => <h4 className="mt-6 text-lg font-semibold">{children}</h4>,
    blockquote: ({ children }) => (
      <blockquote className="mt-6 border-l-4 border-primary pl-4 text-muted-foreground">
        {children}
      </blockquote>
    ),
  },
  list: {
    bullet: ({ children }) => <ul className="mt-4 list-disc space-y-2 pl-6">{children}</ul>,
    number: ({ children }) => <ol className="mt-4 list-decimal space-y-2 pl-6">{children}</ol>,
  },
  marks: {
    link: ({ value, children }) => {
      const href = safeHref((value as { href?: unknown } | undefined)?.href);
      if (!href) return <>{children}</>;
      return href.startsWith("/") || href.startsWith("#") ? (
        <Link href={href} className={linkClass}>
          {children}
        </Link>
      ) : (
        <a href={href} className={linkClass} rel="noopener noreferrer">
          {children}
        </a>
      );
    },
  },
  types: {
    image: ({ value }: { value: ImageValue }) => {
      const url = typeof value.url === "string" ? value.url : null;
      if (!url?.startsWith("https://cdn.sanity.io/images/")) return null;
      const width = typeof value.width === "number" ? value.width : 1200;
      const height = typeof value.height === "number" ? value.height : 800;
      const alt = typeof value.alt === "string" ? value.alt : "";
      const caption = typeof value.caption === "string" ? value.caption : null;
      return (
        <figure className="mt-6">
          <Image
            src={url}
            alt={alt}
            width={width}
            height={height}
            sizes="(min-width: 768px) 42rem, 100vw"
            className="h-auto w-full rounded-2xl"
          />
          {caption ? (
            <figcaption className="mt-2 text-sm text-muted-foreground">{caption}</figcaption>
          ) : null}
        </figure>
      );
    },
  },
};

export function GuideBody({ value }: { value: GuideBlocks }) {
  return <PortableText value={value} components={components} onMissingComponent={false} />;
}
