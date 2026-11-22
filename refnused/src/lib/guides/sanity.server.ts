import "server-only";

import { createClient, type SanityClient } from "@sanity/client";
import { z } from "zod";

import { sanityEnabled, serverEnv } from "@/lib/env.server";

import type { GuideTemplate } from "./slugs";
import { sanityGuideSchema, type SanityGuide } from "./types";

/*
 * Reads guides from Sanity (published documents only). Schema for the Studio:
 * sanity/schemaTypes. Results are cached by the callers in queries.ts and
 * revalidated by the Sanity webhook (/api/revalidate/sanity, tag "guides").
 * If Sanity is unreachable, these return nothing and the built-in guides
 * are shown, so /guides never errors because of the CMS.
 */

let client: SanityClient | null = null;

function sanity(): SanityClient | null {
  if (!sanityEnabled) return null;
  client ??= createClient({
    projectId: serverEnv.SANITY_PROJECT_ID!,
    dataset: serverEnv.SANITY_DATASET,
    apiVersion: serverEnv.SANITY_API_VERSION,
    perspective: "published",
    // Pages are cached by Next and revalidated on publish, so read fresh data.
    useCdn: false,
    token: serverEnv.SANITY_API_READ_TOKEN,
  });
  return client;
}

const SUMMARY_FIELDS = `
  "slug": slug.current,
  template,
  title,
  description,
  model,
  relatedModels,
  "author": author->{ name, role, "slug": slug.current },
  publishedAt,
  "createdAt": _createdAt,
  "updatedAt": _updatedAt,
  "image": mainImage{
    alt,
    "url": asset->url,
    "width": asset->metadata.dimensions.width,
    "height": asset->metadata.dimensions.height
  }
`;

const BODY_FIELD = `
  body[]{
    ...,
    _type == "image" => {
      ...,
      "url": asset->url,
      "width": asset->metadata.dimensions.width,
      "height": asset->metadata.dimensions.height
    }
  }
`;

const LIST_QUERY = `*[_type == "guide" && defined(title)] | order(coalesce(publishedAt, _createdAt) desc) [0...500] { ${SUMMARY_FIELDS} }`;

const ONE_QUERY = {
  slug: `*[_type == "guide" && template == "article" && slug.current == $value][0]{ ${SUMMARY_FIELDS}, ${BODY_FIELD} }`,
  template: `*[_type == "guide" && template == $value] | order(_updatedAt desc) [0]{ ${SUMMARY_FIELDS}, ${BODY_FIELD} }`,
  model: `*[_type == "guide" && template == "model-value" && model == $value] | order(_updatedAt desc) [0]{ ${SUMMARY_FIELDS}, ${BODY_FIELD} }`,
} as const;

function parseGuide(raw: unknown): SanityGuide | null {
  const parsed = sanityGuideSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  console.warn("Skipping invalid Sanity guide", z.prettifyError(parsed.error));
  return null;
}

/** Every published guide, without bodies. */
export async function fetchSanityGuides(): Promise<SanityGuide[]> {
  const c = sanity();
  if (!c) return [];
  try {
    const raw = await c.fetch<unknown[]>(LIST_QUERY);
    return (Array.isArray(raw) ? raw : []).flatMap((g) => parseGuide(g) ?? []);
  } catch (error) {
    console.error("Sanity guides unavailable", error);
    return [];
  }
}

export type GuideLookup =
  | { by: "slug"; value: string }
  | { by: "template"; value: Exclude<GuideTemplate, "article" | "model-value"> }
  | { by: "model"; value: string };

/** One guide with its body: an article by slug, a fixed template, or a model's editorial copy. */
export async function fetchSanityGuide(lookup: GuideLookup): Promise<SanityGuide | null> {
  const c = sanity();
  if (!c) return null;
  try {
    const raw = await c.fetch<unknown>(ONE_QUERY[lookup.by], { value: lookup.value });
    return raw ? parseGuide(raw) : null;
  } catch (error) {
    console.error("Sanity guide unavailable", error);
    return null;
  }
}
