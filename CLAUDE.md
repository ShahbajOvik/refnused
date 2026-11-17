# CLAUDE.md

Guidance for all work in this repository.

## Project

**RefurbednUsed** is a UK website that:

1. **Buys used phones from the public.** Customers get instant trade-in quotes.
2. **Sells refurbished phones** with condition grades and a warranty.
3. **Drives visits to our local stores.**

**Competitors:** CeX, Mazuma Mobile, Back Market.

**Audience:** UK. Use en-GB spelling (colour, optimise, centre), GBP prices (£1,299.00), UK date formats (17/11/2026 or 17 November 2026), and UK phone and postcode formats.

## Stores

| Store     | Address                                    | Phone            |
| --------- | ------------------------------------------ | ---------------- |
| MetroTech | 77A Rudyerd Street, North Shields NE29 6RR | +44 191 380 0456 |
| FairTech  | 2 King St, South Shields NE33 1HT          | +44 191 447 2311 |
| [Store 3] | [Store 3 details]                          | [Store 3 phone]  |

Keep store data in one place (CMS or a single config module). Never hard-code it across components.

## Stack

- **Framework:** Next.js (latest stable), App Router, TypeScript in `strict` mode
- **UI:** Tailwind CSS, shadcn/ui
- **Animation:** Motion, GSAP ScrollTrigger
- **3D:** React Three Fiber + drei
- **Data:** PostgreSQL + Drizzle ORM
- **Auth:** Auth.js
- **Payments:** Stripe
- **Validation:** Zod
- **Email / SMS:** Resend, Twilio
- **File storage:** Cloudflare R2
- **CMS:** Sanity
- **PWA:** Serwist
- **Testing:** Vitest (unit/integration), Playwright (end-to-end)
- **Hosting:** Vercel, London region (`lhr1`)

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

- Schema lives in `src/db/schema/`. Change it, then run `npm run db:generate` to create a migration. Never edit a migration that has been applied anywhere; add a new one.
- Store money as integer pence (`*Pence` columns). Never use floats for money.
- Import `db` from `@/db` in server code only.
- Bank details are encrypted at the application level (`src/lib/crypto/bank-details.ts`). Never log, return to the client, or write to `audit_log` decrypted values.
- Write an `audit_log` entry for price changes, quote/inspection decisions, payouts, refunds and staff/role changes.

### Selling (trade-ins)

- Offers come only from `src/lib/sell/pricing.ts` (pure, fully tested) fed by the database: `trade_in_prices` plus `quote_questions` / `quote_answer_options`. Never price in the browser or trust a client-sent price; recompute when creating a quote.
- Change questions and deductions in the database, not in code. Keep the pricing engine's tests passing for any change to its rules.
- Every public form that writes data needs Zod validation, rate limiting (`src/lib/security/rate-limit.ts`) and Turnstile.

### Shop

- A product is one physical unit, addressed by its permanent `products.slug` (`src/lib/shop/slug.ts`). Never reuse or change a slug.
- Listing filters are URL search params, parsed with `parseShopFilters` and written with `serializeShopFilters` (`src/lib/shop/filters.ts`). Filter, sort and paginate in the database, never in the browser.
- Only `listed` units appear in listings and can be bought. `reserved` and `sold` units keep their page (with notify-me and similar phones); other statuses are not found.
- Delivery, collection and returns terms come from `src/config/shop.ts`, which also feeds the Product JSON-LD. Don't repeat them in components.
- Trade-in-and-save shows an "up to" estimate from `trade_in_prices`. It is not an offer; offers only come from the sell flow.
- Revalidate the `products` cache tag (or `product:<id>`) whenever a unit is listed, reserved, sold or repriced.

### Checkout and orders

- Totals come only from `calculateOrderTotals` (`src/lib/orders/totals.ts`) fed by database prices. The PaymentIntent amount is the server's total; never accept an amount from the browser.
- Only the Stripe webhook (`src/lib/orders/webhook-service.ts`) marks an order paid. Verify the signature, record the event id in `stripe_events` in the same transaction, and check amount and currency.
- Units are held for 15 minutes per checkout (`products.checkout_hold_*`). Cancel a held order's payment intent before taking its units; never take units whose payment is processing.
- Order links use a secret token: store only its hash (and the encrypted copy for emails). Order pages are `noindex` with `no-referrer`.
- The basket cookie holds unit ids only. Don't put prices or totals in it.

### Auth

- Customers and staff use separate Auth.js instances (`src/auth/customer.ts` at `/api/auth`, `src/auth/staff.ts` at `/api/staff-auth`) with separate tables and cookies. Never mix them.
- Every `/admin` page calls `requireStaff(permission)`, and every admin server action is wrapped in `staffAction(permission, zodSchema, handler)`. The proxy (`src/proxy.ts`) is a first check only, never the only one.
- Permissions per role live in `src/auth/roles.ts`. Add each new admin section to `ADMIN_ROUTE_PERMISSIONS` and give its actions the matching permission.
- Staff must pass a passkey or TOTP step after the first sign-in factor, and are signed out after 30 minutes idle. Never add a path around this.
- Staff accounts are created only by an owner (`/admin/staff`) or `npm run staff:create`, never by signing in.
- Customer passkeys can only be added while signed in. Never allow creating an account from a passkey alone.
- Don't set `AUTH_URL`; it would override both instances' base paths.

### Testing

- Write tests for pricing, checkout and auth logic. Cover edge cases (grade boundaries, rounding, discounts, invalid input, unauthorised access).

### Workflow

- Make small commits with clear messages after each working step.
