/*
 * How a variant is described to people. Storage is optional (chargers have
 * none) and configuration is free text (laptop RAM and processor). Pure and
 * safe to import in the browser.
 */

export type VariantOptions = {
  storageGb: number | null;
  configuration?: string | null;
  colour: string;
};

/** 1024GB → "1TB". */
export function storageLabel(gb: number) {
  return gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024}TB` : `${gb}GB`;
}

/** ["128GB", "16GB RAM", "Black"], leaving out options the item doesn't have. */
export function variantParts(v: VariantOptions): string[] {
  return [v.storageGb ? `${v.storageGb}GB` : null, v.configuration || null, v.colour].filter(
    (part): part is string => Boolean(part),
  );
}

/** "128GB, 16GB RAM, Black" */
export function variantLabel(v: VariantOptions, separator = ", ") {
  return variantParts(v).join(separator);
}

/** The word customers see for items in a category. */
export function itemNoun(categorySlug: string | null | undefined) {
  if (categorySlug === "phones") return { one: "phone", many: "phones" };
  if (categorySlug === "laptops") return { one: "laptop", many: "laptops" };
  return { one: "item", many: "items" };
}

/** The noun for a listing: its one category if there is only one, otherwise "items". */
export function listingNoun(selected: string[], inStock: string[]) {
  if (selected.length === 1) return itemNoun(selected[0]);
  return inStock.length <= 1 ? itemNoun(inStock[0] ?? "phones") : itemNoun(null);
}
