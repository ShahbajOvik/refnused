/*
 * Guide URLs. Pure and safe to import anywhere.
 *
 *   /guides/how-much-is-my-iphone-15-worth   one per model we buy (live prices)
 *   /guides/how-to-wipe-a-phone              fixed
 *   /guides/phone-grading-explained          fixed
 *   /guides/<sanity slug>                    any other article from Sanity
 */

export const GUIDE_TEMPLATES = ["article", "model-value", "wipe", "grading"] as const;
export type GuideTemplate = (typeof GUIDE_TEMPLATES)[number];

export const WIPE_GUIDE_SLUG = "how-to-wipe-a-phone";
export const GRADING_GUIDE_SLUG = "phone-grading-explained";

/** Fixed URL for the single-page templates. */
export const FIXED_GUIDE_SLUGS = {
  wipe: WIPE_GUIDE_SLUG,
  grading: GRADING_GUIDE_SLUG,
} as const satisfies Partial<Record<GuideTemplate, string>>;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MODEL_VALUE_RE = /^how-much-is-my-([a-z0-9]+(?:-[a-z0-9]+)*)-worth$/;

export function isGuideSlug(slug: string): boolean {
  return slug.length <= 120 && SLUG_RE.test(slug);
}

/** "iphone-15" → "how-much-is-my-iphone-15-worth" */
export function modelValueSlug(modelSlug: string): string {
  return `how-much-is-my-${modelSlug}-worth`;
}

/** "how-much-is-my-iphone-15-worth" → "iphone-15"; null for other slugs. */
export function parseModelValueSlug(slug: string): string | null {
  return MODEL_VALUE_RE.exec(slug)?.[1] ?? null;
}

export function guidePath(slug: string): string {
  return `/guides/${slug}`;
}

export function modelValueGuidePath(modelSlug: string): string {
  return guidePath(modelValueSlug(modelSlug));
}
