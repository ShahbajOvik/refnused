/**
 * Sanity Studio schema: guide. Plain objects (no `sanity` import) so this
 * repo type-checks without the Studio installed.
 *
 * Templates (see src/lib/guides/compose.ts):
 * - article      Your own guide at /guides/<slug>.
 * - model-value  Extra copy for "How much is my <model> worth?". The page and
 *                its live prices exist for every model we buy; this adds an
 *                author and body. Its URL is fixed: the slug is ignored.
 * - wipe         Replaces the title/description of /guides/how-to-wipe-a-phone
 *                and adds a body after the built-in steps.
 * - grading      The same for /guides/phone-grading-explained.
 *
 * Models are referenced by their slug in our database (e.g. "iphone-15"),
 * as shown in /admin/catalogue.
 */

type Rule = {
  required: () => Rule;
  max: (n: number) => Rule;
  regex: (re: RegExp, options?: { name?: string }) => Rule;
  custom: (
    fn: (value: unknown, context: { document?: Record<string, unknown> }) => true | string,
  ) => Rule;
};

const MODEL_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = ["how-to-wipe-a-phone", "phone-grading-explained"];

export const guide = {
  name: "guide",
  title: "Guide",
  type: "document",
  fields: [
    {
      name: "template",
      title: "Template",
      type: "string",
      initialValue: "article",
      options: {
        list: [
          { title: "Article", value: "article" },
          { title: "How much is my … worth? (model price guide)", value: "model-value" },
          { title: "How to wipe a phone", value: "wipe" },
          { title: "Grading explained", value: "grading" },
        ],
        layout: "radio",
      },
      validation: (rule: Rule) => rule.required(),
    },
    {
      name: "title",
      title: "Title",
      type: "string",
      description: "For model price guides the page title is always “How much is my … worth?”.",
      validation: (rule: Rule) => rule.required().max(110),
    },
    {
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      hidden: ({ document }: { document?: Record<string, unknown> }) =>
        document?.template !== "article",
      validation: (rule: Rule) =>
        rule.custom((value, context) => {
          if (context.document?.template !== "article") return true;
          const current = (value as { current?: string } | undefined)?.current;
          if (!current) return "Articles need a slug";
          if (!MODEL_SLUG.test(current)) return "Lower-case letters, numbers and hyphens only";
          if (RESERVED_SLUGS.includes(current) || /^how-much-is-my-.+-worth$/.test(current)) {
            return "This URL belongs to a built-in guide. Choose that template instead.";
          }
          return true;
        }),
    },
    {
      name: "description",
      title: "Description",
      type: "text",
      rows: 3,
      description: "Shown under the title and in search results. About 150 characters.",
      validation: (rule: Rule) => rule.max(300),
    },
    {
      name: "model",
      title: "Model slug",
      type: "string",
      description: "Model price guides only, e.g. iphone-15.",
      hidden: ({ document }: { document?: Record<string, unknown> }) =>
        document?.template !== "model-value",
      validation: (rule: Rule) =>
        rule.custom((value, context) => {
          if (context.document?.template !== "model-value") return true;
          if (typeof value !== "string" || !MODEL_SLUG.test(value)) return "Enter the model’s slug";
          return true;
        }),
    },
    {
      name: "relatedModels",
      title: "Related models",
      type: "array",
      of: [{ type: "string" }],
      description: "Model slugs. The guide links to each one’s sell, shop and price pages.",
      validation: (rule: Rule) =>
        rule.custom((value) =>
          !Array.isArray(value) || value.every((v) => typeof v === "string" && MODEL_SLUG.test(v))
            ? true
            : "Use model slugs, e.g. iphone-15",
        ),
    },
    { name: "author", title: "Author", type: "reference", to: [{ type: "author" }] },
    {
      name: "publishedAt",
      title: "Published",
      type: "datetime",
      description: "Defaults to when the document was created.",
    },
    {
      name: "mainImage",
      title: "Main image",
      type: "image",
      options: { hotspot: true },
      fields: [
        {
          name: "alt",
          title: "Alternative text",
          type: "string",
          description: "Describe the image for people who can’t see it. Leave empty if decorative.",
        },
      ],
    },
    {
      name: "body",
      title: "Body",
      type: "array",
      of: [
        {
          type: "block",
          styles: [
            { title: "Normal", value: "normal" },
            { title: "Heading", value: "h2" },
            { title: "Subheading", value: "h3" },
            { title: "Quote", value: "blockquote" },
          ],
        },
        {
          type: "image",
          fields: [
            { name: "alt", title: "Alternative text", type: "string" },
            { name: "caption", title: "Caption", type: "string" },
          ],
        },
      ],
    },
  ],
  preview: { select: { title: "title", subtitle: "template", media: "mainImage" } },
} as const;
