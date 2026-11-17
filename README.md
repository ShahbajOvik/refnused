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

## Database

PostgreSQL with Drizzle ORM. Schema in [src/db/schema/](src/db/schema/), migrations in
[drizzle/](drizzle/).

1. Get a Postgres database: [Postgres.app](https://postgresapp.com) or `brew install postgresql@17`
   locally, or a free [Neon](https://neon.tech) database (pick the London region).
2. Set `DATABASE_URL` in `.env.local`.
3. Generate an encryption key with `npm run key:generate` and set `FIELD_ENCRYPTION_KEYS`.
4. Run `npm run db:migrate`, then `npm run db:seed`.

| Command               | What it does                                                |
| --------------------- | ----------------------------------------------------------- |
| `npm run db:generate` | Create a migration from schema changes                      |
| `npm run db:migrate`  | Apply pending migrations                                    |
| `npm run db:seed`     | Seed stores, 10 models, variants and sample trade-in prices |
| `npm run db:studio`   | Browse data in Drizzle Studio                               |
| `npm run db:check`    | Check migrations are consistent                             |

The seed is safe to re-run. It never overwrites trade-in prices that already exist, and it
refuses to run against production. Tests apply the migrations to an in-memory Postgres
(PGlite), so `npm test` needs no database.

Bank details on payouts are encrypted with AES-256-GCM before they reach the database. Only the
last 4 digits of the account number are stored in clear. To rotate keys, put a new key first in
`FIELD_ENCRYPTION_KEYS` and keep the old ones until existing rows are re-encrypted.

## Selling flow

`/sell` → `/sell/[brand]` → `/sell/[brand]/[model]` (static, generated from the database), then a
condition wizard, instant offer, delivery choice and details. Quotes get a 14-day price lock, an
email and SMS confirmation, and a private tracking page at `/sell/track/[token]`.

- **Pricing** is configured in the database: base prices per variant and grade in
  `trade_in_prices`; questions, answers, grade caps and deductions in `quote_questions` and
  `quote_answer_options`. The engine is `src/lib/sell/pricing.ts`.
- **Protection**: Zod validation (IMEI Luhn check, UK postcode, phone, sort code and account
  number), Postgres-backed rate limits, Cloudflare Turnstile, and bank details encrypted at rest.
- **Builds need a database**, because the sell pages are generated from it. Without Postgres you can
  use the test snapshot:

  ```bash
  npm run db:test-snapshot
  DATABASE_URL=pglite://$PWD/.test-db/snapshot.tar.gz npm run build
  ```

  `pglite://` is for tests and CI only (refused on Vercel production). E2E tests use it automatically.

## Authentication

Auth.js v5, with two separate instances so customer and staff sessions can never be confused.

|               | Customers                               | Staff                                              |
| ------------- | --------------------------------------- | -------------------------------------------------- |
| Sign in       | `/sign-in`: magic link, Google, passkey | `/admin/sign-in`: magic link or Google, then 2FA   |
| Second factor | Not required                            | Passkey or authenticator app (TOTP), every sign-in |
| Session       | 30 days, rolling                        | 30 minutes idle, 12 hours maximum                  |
| Accounts      | Created on first sign-in                | Created by an owner only                           |
| Protected     | `/account`                              | `/admin`, by role (see `src/auth/roles.ts`)        |

**First owner.** After migrating, create the first owner:

```bash
npm run staff:create -- --email you@example.co.uk --name "Your Name" --role owner
```

Then sign in at `/admin/sign-in`. You'll be asked to set up a passkey or authenticator app.
Owners add other staff, change roles, reset lost 2FA and deactivate accounts at `/admin/staff`.

**Roles.** `owner` (everything, including staff), `manager` (operations, prices, payouts,
refunds, content, audit log), `staff` (trade-ins, inspections, stock, orders) and
`content_editor` (content and reviews).

**Local development.** Without `AUTH_RESEND_KEY`, magic links are printed in the terminal running
`npm run dev`. Passkeys work on `http://localhost`.

**Audit log.** Sign-ins, sign-outs, denied sign-ins, 2FA success/failure/lockout, idle timeouts,
permission denials and staff changes are written to `audit_log`.

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
