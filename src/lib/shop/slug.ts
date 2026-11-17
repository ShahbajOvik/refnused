/** "Cobalt Violet" → "cobalt-violet", "(PRODUCT)RED" → "product-red". */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * SQL expression matching slugify() for plain ASCII colour names, so colour
 * filters can be applied in the database. Keep the two in sync.
 */
export const COLOUR_SLUG_SQL_PATTERN = "[^a-z0-9]+";

const SUFFIX_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Random 6-character suffix that keeps unit slugs unique. */
export function randomSlugSuffix(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => SUFFIX_ALPHABET[b % SUFFIX_ALPHABET.length]).join("");
}

/** URL slug for one unit, e.g. "iphone-15-128gb-black-k3x9q2". */
export function productSlug(input: {
  modelSlug: string;
  storageGb: number;
  colour: string;
  suffix?: string;
}): string {
  return slugify(
    `${input.modelSlug}-${input.storageGb}gb-${input.colour}-${input.suffix ?? randomSlugSuffix()}`,
  );
}
