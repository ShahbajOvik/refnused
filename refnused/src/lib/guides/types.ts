import { z } from "zod";

import { GUIDE_TEMPLATES, type GuideTemplate } from "./slugs";

/*
 * Guide content from Sanity. Responses are validated with Zod before use:
 * Sanity is an external system and editors can leave fields empty.
 */

const modelSlug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const sanityAuthorSchema = z.object({
  name: z.string().min(1),
  role: z.string().nullish(),
  slug: z.string().nullish(),
});

export const sanityImageSchema = z.object({
  url: z.url({ protocol: /^https$/ }),
  alt: z.string().nullish(),
  width: z.number().int().positive().nullish(),
  height: z.number().int().positive().nullish(),
});

/** Portable Text: checked loosely here, rendered by @portabletext/react. */
const portableTextSchema = z.array(
  z.looseObject({ _type: z.string(), _key: z.string().optional() }),
);

export const sanityGuideSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .nullish(),
  template: z.enum(GUIDE_TEMPLATES).catch("article"),
  title: z.string().min(1),
  description: z.string().nullish(),
  model: modelSlug.nullish(),
  relatedModels: z.array(modelSlug).nullish(),
  author: sanityAuthorSchema.nullish(),
  publishedAt: z.iso.datetime({ offset: true }).or(z.iso.date()).nullish(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  image: sanityImageSchema.nullish(),
  body: portableTextSchema.nullish(),
});

export type SanityGuide = z.infer<typeof sanityGuideSchema>;

/** Portable Text blocks and images, as rendered by components/guides/portable-text.tsx. */
export type GuideBlocks = SanityGuide["body"] & {};

export type GuideAuthor =
  { kind: "person"; name: string; role: string | null } | { kind: "organization"; name: string };

/** One guide, whichever source it came from. */
export type Guide = {
  slug: string;
  template: GuideTemplate;
  title: string;
  description: string;
  author: GuideAuthor;
  /** ISO 8601. */
  publishedAt: string;
  updatedAt: string;
  image: { url: string; alt: string; width: number | null; height: number | null } | null;
  /** Editorial copy from Sanity; null for built-in content only. */
  body: GuideBlocks | null;
  /** Model slugs this guide is about, for internal links. */
  relatedModels: string[];
  /** model-value only: the model whose live prices it shows. */
  model: string | null;
};

/** For the /guides index and related-guide links. */
export type GuideSummary = Pick<
  Guide,
  "slug" | "template" | "title" | "description" | "updatedAt" | "model" | "relatedModels"
>;
