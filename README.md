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

## Shop

`/shop` and `/shop/[brand]` list refurbished units; each unit has its own page at
`/shop/[brand]/[slug]`, and `/compare?items=a,b,c` compares up to three.

- **Filters live in the URL** (`?brand=apple,samsung&grade=A&storage=128&min=200&max=500&battery=90&store=…&sort=price-asc&page=2`),
  so any filtered page can be shared. Parsing (`src/lib/shop/filters.ts`) drops bad values instead
  of erroring, and filtering, facet counts, sorting and pagination all run in the database
  (`src/lib/shop/catalogue.ts`). Only the plain listings are indexed; filtered pages are `noindex`.
- **Product pages** show photos of the actual unit, a lazy-loaded 3D viewer (`View in 3D`), grade,
  battery health, warranty, delivery and click-and-collect, stock per store, a trade-in-and-save
  estimate and similar phones, with `Product` + `Offer` JSON-LD. Delivery, collection and returns
  terms are in `src/config/shop.ts` (sample values).
- **Sold and reserved units** keep their page, with a "notify me" form (`stock_alerts`) and similar
  phones in stock. Only `draft`, `withdrawn` and `returned` units are hidden.
- **Photos** are R2 object keys in `products.photos`, served from `NEXT_PUBLIC_MEDIA_BASE_URL`.
  Without it they come from `public/media` (sample photos: `npm run media:samples`).

## Basket and checkout

`/basket` → `/checkout` → Stripe Payment Element → `/orders/[token]` (private order page).

- **Basket**: a cookie of unit ids only. Prices, delivery and trade-in credit are always worked
  out on the server (`src/lib/orders/totals.ts`), and the full total is shown before payment.
- **Fulfilment**: home delivery (options in `src/config/shop.ts`) or reserve and collect in store
  (paid online, collected with photo ID).
- **Trade-in credit**: enter an open quote's reference (same email as the quote). Its value comes
  off the order; any part that would take the card payment below Stripe's minimum is paid to the
  customer's bank as usual.
- **Holds**: "Continue to payment" creates the order and holds the phones for 15 minutes. Expired
  holds can be taken by another customer only after their payment intent is cancelled; payments
  still processing (e.g. Klarna) keep their hold.
- **Payments**: orders become paid only from the Stripe webhook (`/api/stripe/webhook`), which
  verifies the signature, records each event id (idempotent), checks amount and currency, and
  refunds automatically if a unit was sold elsewhere. Then the confirmation email and SMS go out.
- **Returns and warranty**: from the order page, a return within 14 days (from dispatch or
  collection) or a warranty claim within the unit's warranty, one open request per phone.

### Stripe setup

1. Set `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and `STRIPE_WEBHOOK_SECRET`
   (test keys outside production).
2. In the Stripe Dashboard, enable cards, Apple Pay, Google Pay and Klarna, and register the site's
   domain for Apple Pay.
3. Add a webhook endpoint for `<site>/api/stripe/webhook` with `payment_intent.succeeded`,
   `payment_intent.processing`, `payment_intent.payment_failed`, `payment_intent.canceled` and
   `charge.refunded`. Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

Without Stripe keys (development and tests) a stand-in gateway is used and no payment form is
shown; orders are still only paid by a signed webhook. E2E tests run against Stripe test mode when
`E2E_STRIPE_SECRET_KEY` and `E2E_STRIPE_PUBLISHABLE_KEY` are set.

## Account

`/account` (signed-in customers): overview, trade-ins, orders, addresses, payout details, alerts,
and privacy.

- **Trade-ins**: a status timeline (accepted → received → checked → revised offer → paid). A
  revised offer can be accepted or the phone sent back, from the account.
- **Orders**: delivery or collection progress with carrier tracking links; returns (14 days) and
  warranty claims.
- **Payout details**: shown masked; changing them needs a 6-digit code emailed to the account,
  can be applied to unpaid trade-ins, and sends a "details changed" email.
- **Alerts**: price alerts (shop or trade-in) and back-in-stock alerts.
- **Privacy (UK GDPR)**: marketing consent (recorded in `audit_log`), "Download my data"
  (`/account/export`, JSON, bank details masked) and account deletion (emailed code; blocked while
  anything is in progress). Deletion removes what it can and anonymises order, payment and
  trade-in records that must be kept for 6 years.
- Checkout fills in a signed-in customer's details and default address.

**Testing**: the test snapshot includes demo customers (`src/db/seed/demo.ts`). With
`EMAIL_OUTBOX_DIR` set (never in production), emails such as sign-in links and codes are also
written there as JSON; the e2e tests sign in by reading them.

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
