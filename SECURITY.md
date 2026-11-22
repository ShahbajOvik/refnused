# Security

How RefurbednUsed is protected, what was checked in the security review of
November 2026 (against the OWASP Top 10, 2021), and what someone has to do by
hand.

**Reporting a vulnerability:** email the owner (see the Vercel project
contacts) rather than opening a public issue. Please include steps to
reproduce. We aim to reply within two working days.

---

## You must do these by hand

These can't be done from the code. Tick them off before going live, and
check them again whenever the infrastructure changes.

### Before launch

1. **Vercel environment variables (Production):** set every variable in
   `.env.example`. Never commit real values. Specifically:
   - `NEXT_PUBLIC_SITE_URL` must be `https://…`. The app refuses to start in
     production otherwise, because secure cookies, HSTS and
     `upgrade-insecure-requests` all depend on it.
   - Generate fresh `AUTH_SECRET` (`npm run secret:generate`) and
     `FIELD_ENCRYPTION_KEYS` (`npm run key:generate`) for production. Don't
     reuse development or test values. Store a copy of the encryption key in
     a password manager: without it, bank details can't be decrypted.
   - Generate production VAPID keys (`npm run push:keys`) and set
     `VAPID_SUBJECT` to a real `mailto:`.
   - Mark secrets as **Sensitive** in Vercel so they can't be read back from
     the dashboard.
2. **Cloudflare R2:**
   - The **private** bucket (`R2_PRIVATE_BUCKET`, data-wipe certificates) must
     have **no public access**: no `r2.dev` URL and no custom domain. Check
     under R2 → bucket → Settings → Public access.
   - Create an R2 API token scoped to **these two buckets only**, with
     Object Read & Write. Not an account-wide token.
   - The public media bucket's custom domain is the only one in
     `NEXT_PUBLIC_MEDIA_BASE_URL`.
3. **Stripe:** live keys in Production only. Webhook endpoint
   `<site>/api/stripe/webhook` with exactly the events listed in
   `.env.example`. Use a restricted key if you can (PaymentIntents,
   Refunds, Webhook endpoints).
4. **Cloudflare Turnstile:** create a widget for the production domain only.
   Set both keys; production refuses to start without the secret.
5. **Resend:** verify the sending domain with SPF, DKIM and DMARC
   (`p=quarantine` or stricter), so sign-in links and codes can't be spoofed
   easily.
6. **Sentry** (optional): create the project and set `NEXT_PUBLIC_SENTRY_DSN`.
   In the project's **Security & Privacy** settings, turn on "Data scrubber",
   "Use default scrubbers" and "Prevent storing of IP addresses", and set
   data retention to the shortest you need. The app already scrubs events
   (see below); this is a second layer. For readable stack traces, set
   `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` as **build-time**
   variables. Source maps are uploaded, then deleted from the build.
7. **Database:** use the pooled connection URL with TLS (`sslmode=require`).
   Restrict who can reach the database (provider IP allow-list or private
   networking) and turn on automated backups and point-in-time recovery.
8. **Accounts:** turn on two-factor authentication for everyone with access
   to GitHub, Vercel, Cloudflare, Stripe, Resend, Twilio, Sanity, Sentry and
   the database provider. Create the first owner with `npm run staff:create`
   and make them set up a passkey.
9. **GitHub:** turn on Dependabot alerts and security updates, secret
   scanning and push protection (Settings → Code security). Protect `main`:
   require pull requests and the **Security** workflow to pass.

### After launch

10. **HSTS preload:** the header already asks for it
    (`max-age=63072000; includeSubDomains; preload`). Once **every**
    subdomain serves HTTPS, submit the domain at <https://hstspreload.org>.
    This is hard to undo, so be sure first.
11. **Check the headers** on the live site: <https://securityheaders.com> and
    <https://observatory.mozilla.org> should both score A or better.
12. **Watch the CSP:** open a few pages (home, a product, checkout with a
    test payment, the admin) with the browser console open and look for
    "Refused to …" messages after any change involving third parties.
13. **Penetration test:** an external test before taking real payments at
    volume, and once a year after that.

### Ongoing

- Merge Dependabot pull requests weekly. Security updates come straight away.
- Review the `audit_log` table regularly for unexpected staff actions, price
  changes and refunds.
- Rotate `FIELD_ENCRYPTION_KEYS` (new key first, keep old ones until data is
  re-encrypted), the Stripe webhook secret and API keys at least once a year,
  and immediately if anyone with access leaves.

---

## What was checked

Status: ✅ in place and verified, 🔧 fixed in this review, ⚠️ accepted risk or
needs action (see notes).

### Security headers

| Check                                                                                            | Status | Where                                     |
| ------------------------------------------------------------------------------------------------ | ------ | ----------------------------------------- |
| Content-Security-Policy, nonce + `strict-dynamic` on sensitive routes                            | 🔧     | `src/proxy.ts`, `src/lib/security/csp.ts` |
| CSP on public pages (allow-listed hosts, `frame-ancestors 'none'`, `object-src 'none'`, no eval) | 🔧     | `next.config.ts`                          |
| Strict-Transport-Security, 2 years, subdomains, preload                                          | 🔧     | `next.config.ts`                          |
| Referrer-Policy `strict-origin-when-cross-origin`; `no-referrer` on order and tracking links     | 🔧     | `next.config.ts`, `src/proxy.ts`          |
| Permissions-Policy: only camera (IMEI scanner), payment (Stripe), fullscreen, passkeys           | 🔧     | `src/lib/security/csp.ts`                 |
| `frame-ancestors 'none'` + `X-Frame-Options: DENY`                                               | 🔧     | both                                      |
| `X-Content-Type-Options: nosniff`, COOP, CORP                                                    | 🔧     | `next.config.ts`                          |
| `X-Powered-By` removed                                                                           | 🔧     | `next.config.ts`                          |

**Why two CSPs.** A nonce has to be different on every request, so a page
using one can't be prerendered. The catalogue pages (home, shop, sell,
stores, guides) are prerendered for speed. Next.js puts small inline scripts
in them, and those can't carry a nonce. So:

- **Sensitive routes** (`/account`, `/basket`, `/checkout`, `/orders`,
  `/sell/track`, `/sign-in`, `/admin`) render per request and get a strict
  nonce policy. Only scripts Next.js marks with that request's nonce run,
  plus the scripts they load (Stripe, Turnstile) through `'strict-dynamic'`.
  The one inline script outside Next.js's control, the theme script in the
  root layout (`src/components/theme/theme-script.ts`), is allowed by a hash
  computed from that same constant, so it can't go stale. (next-themes' own
  copy is turned into an inert data block, because its text changes with the
  build's minifier.)
- **Public pages** allow inline scripts but no scripts from other hosts
  except Stripe and Turnstile, no `eval`, no plugins, no framing, and forms
  only to our site and Google sign-in.

⚠️ **Accepted risk:** on public pages, an injected inline script wouldn't be
blocked by the CSP. Mitigations: React escapes all output; the only raw
HTML is JSON-LD (with `<` escaped) and the server-made TOTP QR code;
editor links are protocol-checked (`safeHref`). These pages hold no personal
or payment data, and cookies are `httpOnly`.

`style-src` allows `'unsafe-inline'` everywhere: React, Motion and sonner
set `style=""` attributes, which a nonce can't cover. Injecting CSS is far
less dangerous than injecting scripts.

### OWASP Top 10 (2021)

**A01 Broken access control**

- ✅ Every account page calls `requireCustomer()`, and account actions re-check
  the session and only touch the customer's own rows (tested in
  `src/lib/account/account.db.test.ts`).
- ✅ Every admin page calls `requireStaff(permission)`, and every admin action is
  wrapped in `staffAction(permission, schema, handler)`. Role permissions are
  in `src/auth/roles.ts` (tested). The proxy is a first check only.
- ✅ Quote, order and alert links use 128-bit+ random tokens. Only a hash is
  stored, and the pages are `noindex` + `no-referrer`.
- ✅ Private files (`/admin/files/…`) need a staff session with
  `products.manage` and are served `private, no-store`.
- 🔧 Open redirect after sign-in: `safeCallbackUrl` accepted `/\t/evil.example`
  (browsers drop tabs, leaving `//evil.example`). It now refuses control and
  space characters (tested in `src/auth/access.test.ts`).

**A02 Cryptographic failures**

- ✅ Bank details (holder, sort code, account number) and staff TOTP secrets are
  encrypted with AES-256-GCM, with key ids for rotation
  (`src/lib/crypto/field-encryption.ts`). Only the last digits are kept in
  clear, for display. Decrypted values are never returned to the browser,
  logged or written to `audit_log`.
- ✅ Order access tokens are stored as a hash plus an encrypted copy for
  emails. Push notification paths are encrypted too.
- ✅ Passwords (staff) are hashed (`src/auth/password.ts`). Verification codes
  and tokens are stored as hashes.
- ✅ HTTPS only: HSTS, `Secure` cookies with `__Secure-`/`__Host-` prefixes, and
  production refuses a non-HTTPS site URL (🔧 new check in `env.server.ts`).

**A03 Injection**

- ✅ SQL goes through Drizzle with bound parameters. The only `sql.raw` is a
  constant IMEI pattern in two check constraints.
- ✅ XSS: React escaping; JSON-LD escapes `<`; editor links and images are
  allow-listed; uploads are re-encoded (no SVG or HTML can be stored). CSP as
  above.
- ✅ No shell commands or `eval` in the app.

**A04 Insecure design**

- ✅ Prices, totals and trade-in offers are calculated on the server from the
  database only. The browser sends ids and answers, never amounts
  (`src/lib/sell/pricing.ts`, `src/lib/orders/totals.ts`, both tested). The
  PaymentIntent amount is the server's total.
- ✅ Units are held for 15 minutes per checkout, and payment states are respected
  before units are released.
- ✅ Account deletion and payout changes need an emailed code.

**A05 Security misconfiguration**

- ✅ Headers as above. Private paths are `noindex` via a header as well as meta.
- ✅ Environment validated with Zod at start-up (`src/lib/env.ts`,
  `src/lib/env.server.ts`). Production refuses to start without Stripe live
  keys, the webhook secret, Turnstile, Twilio and Resend, and refuses test
  helpers (`EMAIL_OUTBOX_DIR`).
- ✅ Development fallbacks (console emails/SMS, stand-in payment gateway) can't
  run in production.

**A06 Vulnerable and outdated components**

- 🔧 `npm run audit` (runtime dependencies, fails on high/critical) and
  `npm run audit:all`, plus `.github/workflows/security.yml` on every PR and
  weekly. `.github/dependabot.yml` opens weekly grouped updates, waiting
  14 days after a release before proposing it.
- Audit on 21/11/2026: **0 critical, 0 high**; 8 moderate and 4 low:
  - ⚠️ `@simplewebauthn/server` 9.x (low, attestation certificate checks).
    Not exploitable here: passkeys use `attestationType: "none"`, so no
    attestation is verified. The fix is a major upgrade (v14) together with
    `next-auth`/`@auth/core`, so do it in its own pull request with the passkey
    tests.
  - ⚠️ `drizzle-kit` → `esbuild` dev server, and `shadcn` → `ts-morph` →
    `minimatch`: build and command-line tools only, never in the deployed
    app. Fixed by future major versions; Dependabot will propose them.

**A07 Identification and authentication failures**

- ✅ Separate Auth.js instances, tables and cookies for customers and staff.
- ✅ Staff: second factor (passkey or TOTP) is required, with failed attempts
  limited and the session destroyed after too many. 30-minute idle sign-out.
  Password sign-in is rate limited per IP and account, with Turnstile.
- 🔧 Magic-link sign-in (customers and staff) had **no rate limit or bot
  check**, so it could be used to flood someone's inbox. It now has
  Turnstile, plus limits of 10 an hour per IP and 5 an hour per address
  (`src/lib/security/magic-link-guard.ts`). Auth.js's own
  `POST /api/auth/signin/resend` endpoint, which would bypass those
  checks, is closed (`src/lib/security/auth-routes.ts`, tested).
- ✅ Customer passkeys can only be added while signed in. No accounts are
  created from a passkey alone.

**A08 Software and data integrity failures**

- ✅ Stripe webhook: signature verified on the raw body, event ids recorded
  once in the same transaction, amount and currency checked.
- ✅ Sanity webhook: HMAC signature with a timestamp, size limit, Zod-validated
  body.
- ✅ `package-lock.json` committed; CI uses `npm ci`.
- ✅ Service worker built from source at build time; it never caches personal
  pages or non-GET requests.

**A09 Security logging and monitoring failures**

- ✅ `audit_log` entries for price changes, inspections, payouts, refunds, staff
  and role changes, store edits, sign-in failures, MFA lock-outs, idle
  sign-outs, data exports and marketing consent, written in the same
  transaction as the change.
- 🔧 Sentry error reporting added (off until a DSN is set), with personal data
  scrubbed (below).
- ✅ Error logs never include message bodies, links, tokens or bank details.

**A10 Server-side request forgery**

- ✅ Web Push only POSTs to known browser push services (allow-list, tested).
- ✅ Open Graph images only fetch from our media domain and Sanity's CDN.
- ✅ No other fetches use URLs from users.

### The specific checks you asked for

| Check                                         | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSRF protection                               | ✅ 🔧  | Server Actions: Next.js compares `Origin` with the host. Auth.js: double-submit CSRF token. Session cookies `SameSite=Lax`. 🔧 The admin upload route (cookie-authenticated `POST`) now also checks `Sec-Fetch-Site`/`Origin` (`src/lib/security/same-origin.ts`, tested). Other route handlers don't use cookies (webhooks are signed; push subscription changes need the old secret endpoint).                                                                          |
| Secure cookie flags                           | ✅     | `httpOnly`, `Secure`, `SameSite=Lax`, `__Secure-`/`__Host-` prefixes on HTTPS (`src/auth/cookies.ts`). The basket cookie is deliberately readable by JS (for the item count) and holds only unit ids.                                                                                                                                                                                                                                                                     |
| Zod on every server action and route          | ✅ 🔧  | All 19 action files and 13 route handlers reviewed. Admin actions go through `staffAction(…, schema)`. 🔧 Two gaps fixed: the admin upload form and the marketing-preferences checkboxes now use Zod.                                                                                                                                                                                                                                                                     |
| Rate limiting: auth, quote, checkout, contact | ✅ 🔧  | Quotes (per IP and email), offers, checkout preview and start, stock alerts, order requests, account actions, staff password and MFA, data export, push. 🔧 Magic-link sign-in added. ⚠️ There is **no contact form** yet (`/help` is linked but has no page). When one is built it must use `isRateLimited` and Turnstile like the quote form.                                                                                                                           |
| Turnstile on public forms                     | ✅ 🔧  | Quote, checkout, stock alert, order request, staff password sign-in. 🔧 Customer and staff email sign-in added. Push "turn on notifications" buttons are rate limited instead: they take no free text and need the secret link or a session.                                                                                                                                                                                                                              |
| Private R2 bucket with signed URLs            | ✅ ⚠️  | Certificates go to a separate private bucket. ⚠️ They're served by **streaming through an authenticated route** (`/admin/files/…`, staff session + permission check on every request, `private, no-store`) rather than signed URLs. That's deliberately stricter: no shareable link ever exists, and access ends the moment a session does. Making the bucket private in Cloudflare is a manual step (above).                                                             |
| EXIF stripping on uploads                     | ✅ 🔧  | Photos are content-sniffed (not trusted by name or type), rotated, resized and re-encoded to WebP, which drops EXIF, GPS, XMP and IPTC. 🔧 Now proven by a test that embeds camera and GPS data (`src/lib/storage/uploads.test.ts`).                                                                                                                                                                                                                                      |
| Server-side price checks                      | ✅     | See A04.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Webhook signature checks                      | ✅     | See A08.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Encrypted bank fields                         | ✅     | See A02.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| PII scrubbing in Sentry                       | 🔧     | `src/lib/observability/scrub.ts` (tested): drops the user, cookies and all but harmless headers, and local variables. Filters fields named like personal data or secrets. Replaces emails, UK phone numbers and postcodes, IMEIs, card, sort code and account numbers, API keys, JWTs and the tokens in our quote, order and alert links. `sendDefaultPii` off; no tracing or session replay. The browser SDK loads after the page is idle, to stay within the JS budget. |
| No secrets in the client bundle               | ✅ 🔧  | Server secrets are only read in `server-only` modules (`env.server.ts`). 🔧 `npm run security:secrets` (also in CI) scans every downloadable file for secret values, key patterns and published source maps, and fails if code uses a `NEXT_PUBLIC_` variable that isn't on the allow-list.                                                                                                                                                                               |

---

## Verification (22/11/2026)

Against a production build (`npm run build`, test environment):

- `e2e/security.spec.ts`, desktop and mobile Chromium, all passing:
  - base headers on pages, private pages and API routes;
  - public pages use the static CSP with no violations;
  - sensitive pages get a different nonce on every request, every script in
    the HTML carries it (or is the hashed theme script), with no violations,
    including checkout and the trade-in tracking page;
  - tracking links send no referrer;
  - Auth.js's direct magic-link endpoint returns 404 for both instances;
  - unauthenticated admin uploads are redirected to sign-in.
- `npm run security:secrets`: 117 client files, no secrets, key patterns or
  source maps. Only the 7 expected `NEXT_PUBLIC_` variables are used.
- `npm run budget`: every prerendered page within 200 KB. `/styleguide` is
  exactly at the limit. The sensitive routes now render per request, so the
  script (which reads prerendered HTML) no longer measures them.
- Unit tests for the CSP, headers and route wiring, the scrubber, origin
  checks, closed auth routes, open-redirect cases and EXIF stripping.
- The account, admin, PWA, auth and accessibility e2e suites pass with the
  new headers and sign-in limits. The account tests now reuse a session per
  customer, because sign-in links are limited to 5 an hour per address.

Known failures **not** caused by this review (uncommitted catalogue and
guides work):

- `e2e/a11y.spec.ts` on `/guides/how-much-is-my-iphone-15-worth`: the
  scrolling price table isn't keyboard-focusable (`model-value-guide.tsx`,
  same pattern in `grading-guide.tsx`).
- `e2e/admin.spec.ts` "catalogue: add a laptop model…": `/sell/lenovo`
  returns 200 where the test expects 404.

## Commands

```sh
npm run audit             # runtime dependency advisories (fails on high/critical)
npm run audit:all         # including dev tooling
npm run build             # then:
npm run security:secrets  # nothing secret in client files
npx vitest run src/lib/security src/lib/observability src/lib/storage src/auth
```
