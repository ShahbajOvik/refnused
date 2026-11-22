# RefurbednUsed

UK site for selling used phones (instant trade-in quotes), buying graded refurbished phones with
warranty, and finding our stores. See [CLAUDE.md](CLAUDE.md) for the project rules.

## Repository layout

Three folders in one npm workspace. Run every command from the repo root.

| Folder                 | What it is                                                                  |
| ---------------------- | --------------------------------------------------------------------------- |
| [refnused/](refnused/) | The public website (Next.js). Shop, sell, stores, guides, account, PWA.     |
| [admin/](admin/)       | The staff admin (Next.js), a separate app on its own domain.                |
| [database/](database/) | `@refnused/database`: schema, migrations, seed, db client and shared logic. |

The website and admin never import from each other: anything both need lives in `database/`
(imported as `@refnused/database/<path>`). When the admin changes products, prices, the catalogue
or stores, it asks the website to refresh its cache through a signed request
(`/api/revalidate/tags`, `REVALIDATE_SECRET`).

```
refnused/src/   app/ (routes), components/, lib/ (website-only logic), auth/ (customers), proxy.ts
admin/src/      app/admin/ (routes), components/, lib/admin/ (admin services), auth/ (staff), proxy.ts
database/       src/db/ (schema, client, seed), src/lib/ (shared logic), drizzle/ (migrations), scripts/
e2e/            Playwright tests for both apps, including axe WCAG 2.2 AA scans
```

## Getting started

Requires Node.js 22 or later.

```bash
npm install
cp .env.example .env.local     # one env file at the root for both apps
npm run dev                    # website: http://localhost:3000
npm run dev:admin              # admin:   http://localhost:3001/admin
```

The design system lives at http://localhost:3000/styleguide.

## Scripts

| Command                          | What it does                                                   |
| -------------------------------- | -------------------------------------------------------------- |
| `npm run dev` / `dev:admin`      | Start the website / admin dev server                           |
| `npm run build`                  | Build every app (the website also builds its service worker)   |
| `npm run check`                  | Typecheck, lint, format check and unit tests, in every package |
| `npm run typecheck`              | `tsc` in every package                                         |
| `npm run lint`                   | ESLint in every package                                        |
| `npm run format`                 | Prettier (sorts Tailwind classes too)                          |
| `npm test`                       | Vitest unit tests in every package                             |
| `npm run test:e2e`               | Playwright: starts a real MySQL, builds and serves both apps   |
| `npm run budget -w refnused`     | Checks initial JS per page is under 200KB (run after a build)  |
| `npm run push:keys`              | Generates a VAPID key pair for Web Push                        |
| `npm run pwa:assets -w refnused` | Renders the PWA icons (add `-- --screenshots` for screenshots) |
| `npm run db:seed:owner`          | Seeds the first owner from OWNER_EMAIL/NAME/PASSWORD (admin)   |
| `npm run staff:create`           | Creates a staff account (admin)                                |
| `npm run staff:list`             | Lists staff accounts (email, role, active, password set)       |

First time running e2e tests: `npx playwright install chromium`.

## Deploying

Two Vercel projects from this repo, both in the London region (`lhr1`):

| Project | Root Directory | Domain                     |
| ------- | -------------- | -------------------------- |
| Website | `refnused`     | e.g. `www.example.co.uk`   |
| Admin   | `admin`        | e.g. `admin.example.co.uk` |

Set the shared variables from `.env.example` in both, with the same `REVALIDATE_SECRET`,
`NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_ADMIN_URL`. Run migrations once
(`npm run db:migrate`), not per project.

## Database

MySQL 8.0.16 or newer (InnoDB, utf8mb4) with Drizzle ORM and the `mysql2` driver, in the
`database/` package. Schema in [database/src/db/schema/](database/src/db/schema/), migrations in
[database/drizzle/](database/drizzle/).

1. Get a MySQL 8 database. Locally, the easiest is `npm run db:dev-server` (leave it running): the
   official MySQL 8 binary, no install or Docker, data kept in `.mysql-dev/`, at
   `mysql://root@127.0.0.1:3306/refurbednused`. Or `brew install mysql@8.4`, or your host's.
   MariaDB is not supported (the schema uses MySQL 8 functional indexes and CHECK constraints).
2. Set `DATABASE_URL` in `.env.local`, e.g. `mysql://user:password@localhost:3306/refurbednused`.
   For a remote server, require TLS: append `?ssl={"rejectUnauthorized":true}`.
3. Generate an encryption key with `npm run key:generate` and set `FIELD_ENCRYPTION_KEYS`.
4. Run `npm run db:migrate`, then `npm run db:seed`.

| Command                     | What it does                                                |
| --------------------------- | ----------------------------------------------------------- |
| `npm run db:generate`       | Create a migration from schema changes                      |
| `npm run db:migrate`        | Apply pending migrations                                    |
| `npm run db:seed`           | Seed stores, 10 models, variants and sample trade-in prices |
| `npm run db:seed -- --demo` | Also seed the demo customers and staff (never production)   |
| `npm run db:studio`         | Browse data in Drizzle Studio                               |
| `npm run db:check`          | Check migrations are consistent                             |

The seed is safe to re-run. It never overwrites trade-in prices that already exist, and it
refuses to run against production. `npm test` needs no database: Vitest starts a real MySQL 8
(`mysql-memory-server`, the official binaries, downloaded once and cached; no Docker) and gives
each test file its own freshly migrated database. Set `TEST_MYSQL_VERSION` to test another
version. The e2e tests do the same (`npm run db:e2e-server`), seed it, and run both apps against
it with the production driver.

MySQL notes for anyone changing queries: there is no `RETURNING` (use `$returningId()` or
`affectedRows()` from `database/src/db/results.ts`), `||` means OR (use `concat()`), and
"unique where …" rules are functional unique indexes on an expression that is NULL when the rule
doesn't apply. `npm run db:generate` repairs drizzle-kit's output for indexes that mix columns
and expressions.

Bank details on payouts are encrypted with AES-256-GCM before they reach the database. Only the
last 4 digits of the account number are stored in clear. To rotate keys, put a new key first in
`FIELD_ENCRYPTION_KEYS` and keep the old ones until existing rows are re-encrypted.

## Selling flow

`/sell` → `/sell/[brand]` → `/sell/[brand]/[model]` (static, generated from the database), then a
condition wizard, instant offer, delivery choice and details. Quotes get a 14-day price lock, an
email and SMS confirmation, and a private tracking page at `/sell/track/[token]`.

- **Pricing** is configured in the database: base prices per variant and grade in
  `trade_in_prices`; questions, answers, grade caps and deductions in `quote_questions` and
  `quote_answer_options`. The engine is `database/src/lib/sell/pricing.ts`.
- **Protection**: Zod validation (IMEI Luhn check, UK postcode, phone, sort code and account
  number), database-backed rate limits, Cloudflare Turnstile, and bank details encrypted at rest.
- **Builds need a database**, because the sell pages are generated from it: a migrated and seeded
  MySQL at `DATABASE_URL` (CI uses a MySQL 8 service container).

## Shop

`/shop`, `/shop/[brand]` and `/shop/category/[category]` list refurbished units; each unit has its own page at
`/shop/[brand]/[slug]`, and `/compare?items=a,b,c` compares up to three.

- **Filters live in the URL** (`?brand=apple,samsung&grade=A&storage=128&min=200&max=500&battery=90&store=…&sort=price-asc&page=2`),
  so any filtered page can be shared. Parsing (`database/src/lib/shop/filters.ts`) drops bad values instead
  of erroring, and filtering, facet counts, sorting and pagination all run in the database
  (`database/src/lib/shop/catalogue.ts`). Only the plain listings are indexed; filtered pages are `noindex`.
- **Product pages** show photos of the actual unit, a lazy-loaded 3D viewer (`View in 3D`), grade,
  battery health, warranty, delivery and click-and-collect, stock per store, a trade-in-and-save
  estimate and similar phones, with `Product` + `Offer` JSON-LD. Delivery, collection and returns
  terms are in `database/src/config/shop.ts` (sample values).
- **Sold and reserved units** keep their page, with a "notify me" form (`stock_alerts`) and similar
  phones in stock. Only `draft`, `withdrawn` and `returned` units are hidden.
- **Photos** are R2 object keys in `products.photos`, served from `NEXT_PUBLIC_MEDIA_BASE_URL`.
  Without it they come from `public/media` (sample photos: `npm run media:samples`).

## Basket and checkout

`/basket` → `/checkout` → Stripe Payment Element → `/orders/[token]` (private order page).

- **Basket**: a cookie of unit ids only. Prices, delivery and trade-in credit are always worked
  out on the server (`database/src/lib/orders/totals.ts`), and the full total is shown before payment.
- **Fulfilment**: home delivery (options in `database/src/config/shop.ts`) or reserve and collect in store
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

**Testing**: `npm run db:seed -- --demo` and the e2e database add demo customers (`database/src/db/seed/demo.ts`). With
`EMAIL_OUTBOX_DIR` set (never in production), emails such as sign-in links and codes are also
written there as JSON; the e2e tests sign in by reading them.

## Stores

`/stores` lists every active store and `/stores/[slug]` has one page per store, all from the
`stores` table (edited in `/admin/stores`):

- Address, tap-to-call, Google Maps directions and a map that only loads when the visitor asks
  (no Google cookies or scripts until then).
- Opening hours for each day, with an open-now status worked out in the browser in UK time, so
  cached pages stay right.
- Parking and nearest Metro text, photos (uploaded in admin, with descriptions), published reviews
  of the store, and phones on the shelf there (linking to `/shop?store=…`).
- `ElectronicsStore` JSON-LD with geo coordinates and opening hours, plus breadcrumbs. Reviews are
  shown but not added as `aggregateRating`, because Google ignores ratings a business publishes about
  itself.
- Name, address and phone are written by the same helpers (`storeName`, `storeAddressLines` in
  `database/src/lib/stores.ts`) on store pages, cards, the footer, the mobile menu and JSON-LD.

The seed only fills empty values: coordinates (postcode centres from postcodes.io: move them to the
shop front in admin) and Metro text. Opening hours and parking are left for staff to enter, and a
store without hours shows "Call the store for opening hours". The stores sitemap
(`/sitemaps/stores/sitemap.xml`) lists every store page.

## SEO

- **Metadata.** Every public page builds its metadata with `pageMetadata()` (`refnused/src/lib/metadata.ts`)
  or a page-type template in `refnused/src/lib/metadata-templates.ts` (home, sell brand/model, product,
  stores, guides). That gives each page a canonical URL, `en-GB` and `x-default` hreflang pointing
  at itself, Open Graph and Twitter tags. Filtered listings pass `noindex: true` (noindex, follow).
- **Private pages** (account, basket, checkout, orders, trade-in tracking, sign-in, admin, API) set
  `robots: noindex` and also get `X-Robots-Tag: noindex, nofollow` from `next.config.ts`. robots.txt
  only blocks `/admin` and `/api/`: blocking the others would hide the noindex from crawlers.
- **Open Graph images** are drawn with `next/og` from one layout (`refnused/src/lib/og/card.tsx`): a
  site-wide one (`refnused/src/app/opengraph-image.tsx`, used by pages without their own) and one per sell
  model, product, store and guide (`opengraph-image.tsx` next to each page, with live prices).
  Photos go through sharp first because `next/og` can't read WebP; only our media bucket and
  Sanity's CDN are fetched.
- **Sitemaps.** `/sitemap.xml` is a sitemap index of `/sitemaps/{pages,models,products,stores,guides}/sitemap.xml`
  (`refnused/src/app/sitemaps/*`). Model `lastmod` is the latest trade-in price change; products include
  their photos.
- **JSON-LD.** Builders live in `database/src/lib/seo.ts`: Organization + WebSite (home), ElectronicsStore
  (stores), Product/Offer (products), FAQPage (home and sell model pages), Article (guides) and
  BreadcrumbList (the `Breadcrumbs` component, on every page). FAQ JSON-LD is always built from the
  same items as the visible `FaqList`.
- **Internal links.** `ModelLinks` (`refnused/src/components/seo/model-links.tsx`) links a model's sell page,
  shop listing and guides to each other, only where the target has something on it (we buy it, or
  units are in stock). It's on sell model pages, product pages and guides.

## PWA and push notifications

Uses [Serwist](https://serwist.pages.dev). `@serwist/next` and `@serwist/turbopack` don't fit this
app (Turbopack + `cacheComponents`), so the worker is built after `next build` by
`scripts/build-sw.mts` (esbuild + `@serwist/build`) into `public/sw.js`, which is not committed.

- **Manifest** (`refnused/src/app/manifest.ts`): icons, maskable icons, screenshots and shortcuts (Sell,
  Shop, Stores, Account). Images live in `public/icons` and `public/screenshots`. Re-render them
  with `npm run pwa:assets`. For screenshots, serve a production build on port 3100 and add
  `-- --screenshots`.
- **Service worker** (`refnused/src/sw/sw.ts`, type-checked with `refnused/src/sw/tsconfig.json`): it precaches the
  app shell, meaning `/offline` plus the CSS, fonts and scripts its HTML loads, and the icons.
  Runtime rules are in `refnused/src/lib/pwa/cache-rules.ts` (unit-tested):
  - Stale-while-revalidate: product and model pages, and images.
  - Network-only: basket, checkout, account, orders, tracking, sign-in, admin and `/api`.
    Non-GET requests (Server Actions, mutating API calls) are never handled by the worker.
  - Network-first: other public pages.
  - A page that is offline and not cached gets `/offline`, which shows store details.
- **Updates**: new workers wait. `PwaRegister` (root layout) shows a "new version" toast, and
  Refresh activates the new worker.
- **Install banner** (`InstallBanner`): shown on the tracking page after a quote and on the order
  page once paid. It uses the browser's install prompt where there is one, and step-by-step
  instructions on iPhone and iPad. Dismissing it hides it for 30 days.
- **Web Push** (`database/src/lib/push/`): customers turn it on per quote, order or for their price alerts
  (`PushOptIn`). Permission is only requested when they press the button. Subscriptions are in
  `push_subscriptions` / `push_topics`, and only known browser push services are accepted.
  Quote and order links are secret, so the path a notification opens is stored encrypted.
  Pushes are sent alongside emails from admin quote/inspection/payout actions, order
  fulfilment and request decisions, and the Stripe webhook (order paid). Price alerts are
  checked when units are listed or repriced and when trade-in prices change
  (`database/src/lib/account/price-alert-check.ts`, at most once a week per alert). Without VAPID keys,
  the buttons are hidden and pushes are printed to the console. Generate keys with
  `npm run push:keys`.
- Push data is included in the account data export and deleted with the account.

## Guides and Sanity

`/guides` mixes built-in guides with articles from Sanity (`database/src/lib/guides/`):

| Template      | URL                                    | Content                                                                       |
| ------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| `model-value` | `/guides/how-much-is-my-<model>-worth` | One per model we buy. Live prices from `trade_in_prices`.                     |
| `wipe`        | `/guides/how-to-wipe-a-phone`          | Steps in `refnused/src/content/guides.ts`.                                    |
| `grading`     | `/guides/phone-grading-explained`      | Grades from `database/src/lib/grades.ts`, battery bands from `batteryRating`. |
| `article`     | `/guides/<slug>`                       | Written in Sanity.                                                            |

A Sanity document with template `model-value` (and a model slug), `wipe` or `grading` adds an
author, dates and body copy to that built-in guide; the URL and live content stay. Price guides
show the most we pay (base prices): they're a guide, not an offer, and link to the sell flow.

Setup:

1. Create a Sanity project and add the schema in `sanity/schemaTypes` to its Studio (plain objects,
   so this repo doesn't need the `sanity` package). Set `SANITY_PROJECT_ID` and `SANITY_DATASET`
   (and `SANITY_API_READ_TOKEN` for a private dataset).
2. Add a GROQ-powered webhook in Sanity: URL `<site>/api/revalidate/sanity`, POST, on create,
   update and delete, filter `_type in ["guide", "author"]`, projection `{_type, "slug": slug.current}`,
   with a secret. Put the same secret in `SANITY_REVALIDATE_SECRET`. The route checks the
   signature (and rejects anything older than five minutes) and revalidates the `guides` tag.

Without Sanity (development, tests) the built-in guides still work. If Sanity is unreachable the
pages fall back to built-in content instead of erroring. Every response is validated with Zod, and
Portable Text links are limited to relative, http(s), mailto and tel URLs.

## Admin

`/admin` is for staff (separate sign-in). It works on phones and tablets: a
sidebar on large screens, a sideways-scrolling section bar on smaller ones. Each role sees only the
sections it can use (`admin/src/auth/roles.ts`), and every page and action checks permission on the server.

| Section            | What it does                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Dashboard          | Today's trade-ins, orders and payouts, stock by store, revenue after refunds (owners and managers only). |
| Trade-ins          | Queue by stage; mark received; inspection form (actual grade, photos, CheckMEND result, revised offer).  |
| Payouts            | Approved payouts; export a bank CSV (the only place bank details are decrypted); mark paid or failed.    |
| Catalogue          | Categories, brands, models and their options (owners and managers). Nothing is deleted, only hidden.     |
| Device intake      | Add one unit: IMEI, serial number or stock code by category, grade, photos, price, store; publish.       |
| Products           | Edit price, status and store of any unit.                                                                |
| Orders             | Dispatch with tracking, ready for collection, delivered/collected, full or part refunds.                 |
| Returns & warranty | Approve, reject and complete requests; completing a return marks the unit as returned.                   |
| Prices             | Trade-in price table per model, variant and grade; CSV export/import with preview; margin calculator.    |
| Customers          | Search, then see a customer's trade-ins, orders and requests.                                            |
| Stores             | Address, phone and opening hours (shown on the site and in JSON-LD).                                     |
| Content            | Links to Sanity Studio (set `SANITY_STUDIO_URL`).                                                        |
| Staff, Audit log   | Staff users and roles (owners); every change above is in `audit_log`.                                    |

**Categories**: each category sets how units are identified (IMEI, serial number or a generated stock
code) and whether they have storage, a battery and a data-wipe certificate. Those rules are checked on
the server at intake and lock once a category has stock. Trade-ins are for IMEI categories only, and a
new phone appears on the sell pages once its trade-in prices are set.

**Files**: photos and certificates go to Cloudflare R2 (`R2_*` variables): photos to the public
media bucket, re-encoded to WebP with location data removed; certificates to the private bucket,
served only to staff. Without R2 they are stored in `.media/` for local development.

**Notes**: CheckMEND results are entered by hand (no API integration). The bank export is a plain
CSV; check the layout your bank expects. Margin calculator VAT and card fee values are examples.
IMEI scanning uses the browser's BarcodeDetector (Chrome on Android); elsewhere type the IMEI.
Refunds are requested from Stripe and the order updates when the webhook confirms them.

**Testing**: the e2e database and `npm run db:seed -- --demo` have demo staff (`demo.owner@` and
`demo.staff@example.co.uk`, in `database/src/db/seed/demo.ts`, test data only).

## Authentication

Auth.js v5, with two separate instances so customer and staff sessions can never be confused.

|               | Customers                               | Staff                                             |
| ------------- | --------------------------------------- | ------------------------------------------------- |
| Sign in       | `/sign-in`: magic link, Google, passkey | `/admin/sign-in`: password, magic link or Google  |
| Second factor | Not required                            | None                                              |
| Session       | 30 days, rolling                        | 30 minutes idle, 12 hours maximum                 |
| Accounts      | Created on first sign-in                | Created by an owner only                          |
| Protected     | `/account`                              | `/admin`, by role (see `admin/src/auth/roles.ts`) |

**First owner.** After migrating, seed the first owner from `.env.local`:

```bash
# .env.local: OWNER_EMAIL=you@example.co.uk  OWNER_NAME="Your Name"  OWNER_PASSWORD=…
npm run db:seed:owner
```

It's safe to re-run (an existing account and password are never changed). Remove
`OWNER_PASSWORD` from the file once you've signed in. Or do it by hand:

```bash
npm run staff:create -- --email you@example.co.uk --name "Your Name" --role owner
npm run staff:set-password -- --email you@example.co.uk
```

Then sign in at `/admin/sign-in` with that email and password. Owners add other staff, change
roles and deactivate accounts
at `/admin/staff`. Staff set or change their own password at `/admin/security`; anyone who forgets
theirs can sign in with an emailed link and set a new one there.

**Roles.** `owner` (everything, including staff), `manager` (operations, prices, payouts,
refunds, content, audit log), `staff` (trade-ins, inspections, stock, orders) and
`content_editor` (content and reviews).

**Local development.** Without `AUTH_RESEND_KEY`, magic links are printed in the terminal running
`npm run dev`.

**Audit log.** Sign-ins, sign-outs, denied sign-ins, idle timeouts,
permission denials and staff changes are written to `audit_log`.

## Design system

- **Colour:** tokens in [refnused/src/app/globals.css](refnused/src/app/globals.css). One brand accent
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
