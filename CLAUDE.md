# CLAUDE.md

Guidance for all work in this repository.

## Project

**RefurbednUsed** is a UK website that:

1. **Buys used phones from the public.** Customers get instant trade-in quotes.
2. **Sells refurbished phones** with condition grades and a warranty.
3. **Drives visits to our local stores.**

**Competitors:** CeX, Mazuma Mobile, Back Market.

**Audience:** UK. Use en-GB spelling (colour, optimise, centre), GBP prices (£1,299.00), UK date formats (17/11/2026 or 17 November 2026), and UK phone and postcode formats.

## Repository layout

Three folders, one npm workspace (run commands from the repo root):

| Folder      | What it is                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------- |
| `refnused/` | The public website: a Next.js app and its own Vercel project.                                       |
| `admin/`    | The staff admin: a separate Next.js app and Vercel project (its own domain, e.g. `admin.<domain>`). |
| `database/` | `@refnused/database`: schema, migrations, seed, db client, and the business logic both apps share.  |

- Code used by both apps goes in `database/` (no React or UI there). Import it as
  `@refnused/database/<path>`; inside `database/`, use relative imports. Small UI components
  (shadcn/ui) are copied into each app, not shared.
- Never import from one app into the other. If both need something, move it to `database/`.
- The admin changes data the website caches. After changing products, prices, the catalogue or
  stores, call `refreshCache(...tags)` (`admin/src/lib/refresh-cache.ts`), which refreshes the
  admin and asks the website to refresh via the signed `/api/revalidate/tags` route
  (`REVALIDATE_SECRET`).
- Links from the admin to public pages are absolute: `websiteUrl(path)` (`admin/src/lib/website.ts`).
- One `.env.local` at the repo root serves both apps and `database/` scripts.

## Stores

| Store     | Address                                           | Phone            |
| --------- | ------------------------------------------------- | ---------------- |
| MetroTech | 77A Rudyerd Street, North Shields NE29 6RR        | +44 191 380 0456 |
| FairTech  | 2 King St, South Shields NE33 1HT                 | +44 191 447 2311 |
| FairTech  | 20B Saville Street (West), North Shields NE29 6QR | +44 191 435 8411 |

Store data lives in the `stores` table (edited in the admin at `/admin/stores`); `database/src/config/site.ts` only seeds it. Never hard-code store details in components. Write a store's name, address and phone only with the helpers in `database/src/lib/stores.ts` (`storeName`, `storeAddressLines`, `storeAddress`, `phoneDisplay`) so they match exactly on pages, in the footer and in JSON-LD.

## Stack

- **Framework:** Next.js (latest stable), App Router, TypeScript in `strict` mode
- **UI:** Tailwind CSS, shadcn/ui
- **Animation:** Motion, GSAP ScrollTrigger
- **3D:** React Three Fiber + drei
- **Data:** MySQL 8.0.16+ (InnoDB, utf8mb4) + Drizzle ORM (`mysql2` driver)
- **Auth:** Auth.js
- **Payments:** Stripe
- **Validation:** Zod
- **Email / SMS:** Resend, Twilio
- **File storage:** Cloudflare R2
- **CMS:** Sanity
- **PWA:** Serwist
- **Testing:** Vitest (unit/integration), Playwright (end-to-end)
- **Hosting:** Vercel, London region (`lhr1`): two projects, Root Directory `refnused/` (website) and `admin/` (admin)

## Rules

### Architecture

- Server Components by default. Use Client Components (`"use client"`) only when you need interactivity, browser APIs or client state, and keep them as small and as far down the tree as possible.

### Pricing and data integrity

- Calculate all prices, totals and trade-in quotes on the server. Never trust a price, total or quote sent by the client.
- Validate every input with Zod: form data, Server Actions, route handlers, webhooks, search params and env vars.

### Secrets

- Never put secrets in code. Use environment variables.
- Keep `.env.example` up to date with every variable the app uses, using placeholder values only.

### SEO (every public page)

- Server-rendered.
- Unique metadata (title, description, canonical, Open Graph).
- JSON-LD structured data (e.g. `Product`, `Offer`, `LocalBusiness`/`Store`, `BreadcrumbList`, `FAQPage` where relevant).
- Visible breadcrumbs.

### Performance budget

- LCP < 2.5s
- INP < 200ms
- CLS < 0.1
- Initial JS < 200KB per page
- 3D is always lazy-loaded, has a static image fallback, and respects `prefers-reduced-motion`. The same applies to heavy animations.

### Accessibility

- Meet WCAG 2.2 AA: semantic HTML, keyboard access, visible focus, sufficient contrast, labelled form controls, alt text, and minimum target sizes.

### Database

- Schema lives in `database/src/db/schema/`. Change it, then run `npm run db:generate` (from the repo root) to create a migration in `database/drizzle/`. Never edit a migration that has been applied anywhere; add a new one.
- Store money as integer pence (`*Pence` columns). Never use floats for money. MySQL returns
  `SUM`/`AVG` as decimal strings: `cast(... as signed)` them.
- MySQL has no `RETURNING` or partial indexes: use `$returningId()`, `affectedRows()` and the
  error helpers in `database/src/db/results.ts`, and functional unique indexes whose expression
  is NULL when the rule doesn't apply. Use `concat()`, never `||`. Always generate migrations with
  `npm run db:generate` (it repairs drizzle-kit's mixed column/expression indexes).
- Import `db` from `@refnused/database/db` in server code only.
- Bank details are encrypted at the application level (`database/src/lib/crypto/bank-details.ts`). Never log, return to the client, or write to `audit_log` decrypted values.
- Write an `audit_log` entry for price changes, quote/inspection decisions, payouts, refunds and staff/role changes.

### Selling (trade-ins)

- Offers come only from `database/src/lib/sell/pricing.ts` (pure, fully tested) fed by the database: `trade_in_prices` plus `quote_questions` / `quote_answer_options`. Never price in the browser or trust a client-sent price; recompute when creating a quote.
- Change questions and deductions in the database, not in code. Keep the pricing engine's tests passing for any change to its rules.
- Every public form that writes data needs Zod validation, rate limiting (`database/src/lib/security/rate-limit.ts`) and Turnstile.

### Shop

- A product is one physical unit, addressed by its permanent `products.slug` (`database/src/lib/shop/slug.ts`). Never reuse or change a slug.
- Listing filters are URL search params, parsed with `parseShopFilters` and written with `serializeShopFilters` (`database/src/lib/shop/filters.ts`). Filter, sort and paginate in the database, never in the browser.
- Only `listed` units appear in listings and can be bought. `reserved` and `sold` units keep their page (with notify-me and similar phones); other statuses are not found.
- Delivery, collection and returns terms come from `database/src/config/shop.ts`, which also feeds the Product JSON-LD. Don't repeat them in components.
- Trade-in-and-save shows an "up to" estimate from `trade_in_prices`. It is not an offer; offers only come from the sell flow.
- Revalidate the `products` cache tag (or `product:<id>`) whenever a unit is listed, reserved, sold or repriced.

### Checkout and orders

- Totals come only from `calculateOrderTotals` (`database/src/lib/orders/totals.ts`) fed by database prices. The PaymentIntent amount is the server's total; never accept an amount from the browser.
- Only the Stripe webhook (`refnused/src/lib/orders/webhook-service.ts`) marks an order paid. Verify the signature, record the event id in `stripe_events` in the same transaction, and check amount and currency.
- Units are held for 15 minutes per checkout (`products.checkout_hold_*`). Cancel a held order's payment intent before taking its units; never take units whose payment is processing.
- Order links use a secret token: store only its hash (and the encrypted copy for emails). Order pages are `noindex` with `no-referrer`.
- The basket cookie holds unit ids only. Don't put prices or totals in it.

### Account and personal data

- Every account page calls `requireCustomer()`, and every account action re-checks the session (`currentCustomer()`) and only touches the customer's own rows.
- Changing payout details or deleting an account needs an emailed code (`refnused/src/lib/account/verification.ts`). Show bank details masked only; never return decrypted values.
- Record marketing consent changes in `audit_log` (`customer.marketing_consent`).
- When adding personal data, include it in `exportCustomerData` and handle it in `deleteCustomerAccount` (`refnused/src/lib/account/privacy.ts`): delete it, or anonymise it if the law requires keeping it.

### Auth

- Customers and staff use separate Auth.js instances (`refnused/src/auth/customer.ts` at `/api/auth`, `admin/src/auth/staff.ts` at `/api/staff-auth`) with separate tables and cookies. Never mix them.
- Every `/admin` page calls `requireStaff(permission)`, and every admin server action is wrapped in `staffAction(permission, zodSchema, handler)`. The admin proxy (`admin/src/proxy.ts`) is a first check only, never the only one.
- Permissions per role live in `admin/src/auth/roles.ts`. Add each new admin section to `ADMIN_ROUTE_PERMISSIONS` and give its actions the matching permission.
- Staff must pass a passkey or TOTP step after the first sign-in factor, and are signed out after 30 minutes idle. Never add a path around this.
- Staff accounts are created only by an owner (`/admin/staff`) or `npm run staff:create`, never by signing in.
- Customer passkeys can only be added while signed in. Never allow creating an account from a passkey alone.
- Don't set `AUTH_URL`; it would override both instances' base paths.

### Admin

- Admin services live in `admin/src/lib/admin/` and take `db` as an argument; pages and actions stay thin.
- Every admin write records an `audit_log` entry in the same transaction as the change (prices,
  inspections, payouts, products, orders, requests, stores, staff). Refunds are audited when
  requested from Stripe; the webhook then updates the order.
- Staff uploads go through `/admin/upload` (`admin/src/lib/storage/uploads.ts`): check content, re-encode
  photos (strips EXIF/GPS), certificates to the private bucket only.
- Stores are edited in `/admin/stores` and read with `loadPublicStores()` (cache tag `stores`);
  `database/src/config/site.ts` only seeds them. Refresh `stores` after changes with `refreshCache` (below).
- Client components must not import `@refnused/database/db`, schema or `drizzle-orm` (keeps pages within the JS budget).
  Put DB queries in `*.server.ts`, `admin/src/lib/admin/` or `database/`.

### Testing

- Write tests for pricing, checkout and auth logic. Cover edge cases (grade boundaries, rounding, discounts, invalid input, unauthorised access).

### Workflow

- Make small commits with clear messages after each working step.
