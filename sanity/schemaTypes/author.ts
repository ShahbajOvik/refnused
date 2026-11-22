/**
 * Sanity Studio schema: guide author. Plain objects (no `sanity` import) so
 * this repo type-checks without the Studio installed; copy or import these
 * into your Studio's schema. Shown in the byline and Article JSON-LD.
 */
export const author = {
  name: "author",
  title: "Author",
  type: "document",
  fields: [
    {
      name: "name",
      title: "Name",
      type: "string",
      validation: (rule: { required: () => unknown }) => rule.required(),
    },
    {
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "name", maxLength: 96 },
    },
    {
      name: "role",
      title: "Role",
      type: "string",
      description: "Shown after the name, e.g. “Trade-in manager”.",
    },
  ],
  preview: { select: { title: "name", subtitle: "role" } },
} as const;
