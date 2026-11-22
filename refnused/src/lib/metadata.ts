import type { Metadata } from "next";

import { siteConfig } from "@refnused/database/config/site";

/*
 * Metadata templates. Every public page builds its metadata with
 * pageMetadata() (or one of the page-type templates in metadata-templates.ts),
 * so each one gets the same canonical, hreflang, Open Graph and Twitter tags.
 * Private pages (account, basket, checkout, orders, admin) use privateMetadata().
 */

/** The site's only language. hreflang points every page at itself. */
export const SITE_LANGUAGE = "en-GB";

/** Size of every generated Open Graph image. */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** The site-wide image from src/app/opengraph-image.tsx. */
export const DEFAULT_OG_IMAGE = {
  url: "/opengraph-image",
  ...OG_IMAGE_SIZE,
  alt: `${siteConfig.name}: sell your phone or buy refurbished`,
};

export type OgImage = { url: string; width?: number; height?: number; alt: string };

export type PageMetadataInput = {
  /** Page title. The root layout adds " | RefurbednUsed" unless absoluteTitle is set. */
  title: string;
  absoluteTitle?: boolean;
  description: string;
  /** Canonical path, including any query that makes the page distinct. */
  path: string;
  /**
   * "file": the route has its own opengraph-image file, so leave images out
   * and let Next add it. Omitted: the site-wide image.
   */
  image?: OgImage | "file";
  type?: "website" | "article";
  article?: { publishedTime: string; modifiedTime: string; authors: string[] };
  /** Keep out of the index but let crawlers follow links (filtered listings). */
  noindex?: boolean;
};

export function pageMetadata(input: PageMetadataInput): Metadata {
  const fullTitle = input.absoluteTitle ? input.title : `${input.title} | ${siteConfig.name}`;
  const images = input.image === "file" ? {} : { images: [input.image ?? DEFAULT_OG_IMAGE] };
  const openGraph: NonNullable<Metadata["openGraph"]> =
    input.type === "article" && input.article
      ? {
          type: "article",
          publishedTime: input.article.publishedTime,
          modifiedTime: input.article.modifiedTime,
          authors: input.article.authors,
          ...shared(),
        }
      : { type: "website", ...shared() };

  function shared() {
    return {
      title: fullTitle,
      description: input.description,
      url: input.path,
      siteName: siteConfig.name,
      locale: "en_GB",
      ...images,
    };
  }

  return {
    title: input.absoluteTitle ? { absolute: input.title } : input.title,
    description: input.description,
    alternates: {
      canonical: input.path,
      languages: { [SITE_LANGUAGE]: input.path, "x-default": input.path },
    },
    openGraph,
    twitter: { card: "summary_large_image", title: fullTitle, description: input.description },
    ...(input.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/**
 * Account, basket, checkout, order and admin pages: never indexed, never
 * followed, no canonical or social tags. next.config.ts also sends
 * X-Robots-Tag: noindex for these paths.
 */
export function privateMetadata(title: string, options?: { nocache?: boolean }): Metadata {
  return {
    title,
    robots: { index: false, follow: false, ...(options?.nocache ? { nocache: true } : {}) },
  };
}

/** Clamp a meta description to ~160 characters at a word boundary. */
export function metaDescription(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : cut.length).replace(/[,;:.\s]+$/, "")}…`;
}
