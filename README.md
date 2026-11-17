# RefurbednUsed

UK site for selling used phones (instant trade-in quotes), buying graded refurbished phones with
warranty, and finding our stores. See [CLAUDE.md](CLAUDE.md) for the project rules.

## Getting started

Requires Node.js 22 or later.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The design system lives at http://localhost:3000/styleguide.

## Scripts

| Command             | What it does                                                  |
| ------------------- | ------------------------------------------------------------- |
| `npm run dev`       | Start the dev server                                          |
| `npm run build`     | Production build                                              |
| `npm run check`     | Typecheck, lint, format check and unit tests                  |
| `npm run typecheck` | Generate route types and run `tsc`                            |
| `npm run lint`      | ESLint                                                        |
| `npm run format`    | Prettier (sorts Tailwind classes too)                         |
| `npm test`          | Vitest unit tests                                             |
| `npm run test:e2e`  | Playwright tests (builds and serves the app first)            |
| `npm run budget`    | Checks initial JS per page is under 200KB (run after a build) |

First time running e2e tests: `npx playwright install chromium`.

## Structure

```
src/
  app/                 Routes (App Router). Server Components by default.
    styleguide/        Design system reference page (noindex)
  components/
    ui/                Base components (shadcn/ui, customised)
    layout/            Header, footer, mobile menu, logo
    seo/               JSON-LD and breadcrumbs
    theme/             Light/dark theme provider and toggle
  config/site.ts       Brand, navigation, stores and links (single source)
  lib/                 Formatting, grades, SEO helpers, env validation
e2e/                   Playwright tests, including axe WCAG 2.2 AA scans
scripts/               Tooling scripts
```

## Design system

- **Colour:** tokens in [src/app/globals.css](src/app/globals.css). One brand accent
  (`primary`) for actions; everything else neutral. Grade A/B/C have their own semantic tokens.
  All text pairs meet WCAG AA in light and dark.
- **Type:** Geist via `next/font`.
- **Spacing:** Tailwind's 4px scale, plus `page-container`, `max-w-page`, `--spacing-section`
  and `--spacing-header` layout tokens.
- **Radius:** base 12px (`rounded-lg`), with sm/md/xl/2xl steps.
- **Components:** Button, Card, Badge and GradeBadge, Input, Select, Dialog, Sheet, Toast (Sonner),
  Skeleton, Breadcrumbs.

Add new shadcn components with `npx shadcn@latest add <name>`, then align sizes with the existing
ones (40px default control height).
