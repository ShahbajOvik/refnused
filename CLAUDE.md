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

| Store     | Address                                      | Phone            |
| --------- | -------------------------------------------- | ---------------- |
| MetroTech | 77A Rudyerd Street, North Shields NE29 6RR   | +44 191 380 0456 |
| FairTech  | 2 King St, South Shields NE33 1HT            | +44 191 447 2311 |
| [Store 3] | [Store 3 details]                            | [Store 3 phone]  |

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

### Testing
- Write tests for pricing, checkout and auth logic. Cover edge cases (grade boundaries, rounding, discounts, invalid input, unauthorised access).

### Workflow
- Make small commits with clear messages after each working step.
