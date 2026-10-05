# Lead Capture App

Production lead-capture application: Node.js/Express backend, React frontend, PostgreSQL database.
Full architecture and rationale live in the project plan doc (shared separately); this file covers
day-to-day setup.

## Structure

```
backend/    Express + TypeScript API, Prisma schema
frontend/   React + Vite + TypeScript
```

Both are npm workspaces of the root `package.json` - run `npm install` once at the repo root, not
inside each folder.

## Prerequisites

- Node.js 20+
- A PostgreSQL database connection string (`DATABASE_URL`). This project's usual dev sandbox cannot
  run Docker or a local Postgres server itself - use a free managed instance (e.g. Neon, Supabase)
  for development, or Docker Compose (below) on a machine that has Docker installed.

## First-time setup

```bash
npm install                       # installs both workspaces from the repo root
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# edit backend/.env: set DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
# (generate secrets with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
```

Generate the Prisma client and run migrations (needs a real `DATABASE_URL` and outbound network
access to `binaries.prisma.sh` - if that domain is blocked in your environment, run these from a
machine/network where it isn't):

```bash
cd backend
npx prisma generate
npx prisma migrate dev --name init
```

## Running locally

```bash
npm run dev:backend     # http://localhost:4000  (try GET /health)
npm run dev:frontend    # http://localhost:5173
```

## Docker (optional, for a machine with Docker installed)

```bash
docker compose up --build
```

Spins up Postgres, the backend, and the frontend together. Not runnable from inside this project's
own dev sandbox shell (no Docker there) - use your own machine or CI.

## Quality checks

```bash
npm run lint             # both workspaces
npm run typecheck        # both workspaces (tsc --noEmit / tsc -b)
npm run test             # both workspaces (vitest) - 58 backend + 23 frontend tests
```

CI (`.github/workflows/ci.yml`) runs all three, plus each workspace's production build, on every
push and pull request to `main` - see "Testing & CI/CD (Phase 8)" below.

## Email (Phase 5)

New submissions trigger two notification emails, sent via [Resend](https://resend.com) as a
background job that never blocks or fails the API response (see `src/services/emailService.ts`
and the call site in `src/services/leadService.ts`):

- An internal alert to `ADMIN_NOTIFICATION_EMAIL` with the full lead details.
- A confirmation to the submitter's own email address.

Configure in `backend/.env` (see `.env.example` for the full description of each variable):

```
EMAIL_PROVIDER="resend"
EMAIL_API_KEY="re_..."          # from https://resend.com/api-keys
EMAIL_FROM="onboarding@resend.dev"
ADMIN_NOTIFICATION_EMAIL="you@example.com"
```

**Test domain caveat:** `onboarding@resend.dev` is Resend's shared sending domain - it works with
no setup, but Resend rejects mail sent from it to any `to` address other than the one the Resend
account itself was signed up with. This applies to **both** notification emails, not just the
submitter confirmation - if `ADMIN_NOTIFICATION_EMAIL` isn't that exact signup address, the admin
alert bounces too (a 403 from Resend, visible as a `WARN` log line: "Email provider rejected a
notification email"). To fully verify Phase 5 before a real domain exists, temporarily set
`ADMIN_NOTIFICATION_EMAIL` to your Resend account's own signup email and submit a test lead using
that same address, so both emails land in one inbox. To fix this properly for production, verify
your own domain in the Resend dashboard and change `EMAIL_FROM` to an address on it (e.g.
`no-reply@yourdomain.com`) - at that point both emails work for any real recipient, no code change
needed, since the domain lives entirely in configuration.

If both emails fail (bad key, provider outage, etc.), the lead is still saved - only the
notification is lost, and it's logged as a warning rather than surfaced to the submitter.

## Admin auth & dashboard (Phase 6)

A protected admin app lives at `/admin` in the frontend, backed by cookie-based JWT auth in the
backend. There is deliberately **no public registration endpoint** - the only way an admin account
comes into existence is the CLI script below, run by someone with shell access to the server.

**Creating the first (or any) admin user**, from `backend/`:

```bash
npx tsx scripts/create-admin.ts --email you@example.com --password 'a strong passphrase' [--role admin|viewer]
```

The password needs to be 12+ characters, is hashed with bcrypt before it touches the database, and
is never logged. Running it again for the same email resets that admin's password/role - there's no
separate "reset password" flow yet.

**Signing in:** open `/admin` in the frontend (it redirects to `/admin/login` if you're not signed
in) and log in with the email/password from the command above.

**How the session works:** login issues two httpOnly cookies - a short-lived access token
(`JWT_ACCESS_TTL_MINUTES`, default 15 min) used on every protected request, and a longer-lived
refresh token (`JWT_REFRESH_TTL_DAYS`, default 7 days) scoped only to `/api/auth/refresh`. Neither
is ever readable from JavaScript. The frontend's API client (`frontend/src/admin/api.ts`)
transparently refreshes an expired access token once and retries the request; if that also fails,
it redirects to the login page. Logging out invalidates every outstanding token for that admin (not
just the one in the current browser), since there's no per-device session table - the right
trade-off for a small admin team, not a full "log out one device" feature.

**Brute-force protection:** the login endpoint has its own stricter IP rate limit on top of the
whole-API baseline, and separately, an account is locked for `ADMIN_LOGIN_LOCKOUT_MINUTES` (default
15) after `ADMIN_LOGIN_MAX_ATTEMPTS` (default 5) consecutive failed password attempts - tracked per
account, not just per IP, so a slow distributed attempt against one email still gets caught.

**What the dashboard does:** a filterable, sortable, paginated table of leads (`GET /api/leads`), a
detail view per lead including its full status-change history (`GET /api/leads/:id`), and the
ability to move a lead through `new -> contacted -> converted`, or mark it `spam`
(`PATCH /api/leads/:id/status`) - every change is recorded in `lead_status_history` with who made it
and when.

## Security & abuse hardening (Phase 7)

Beyond the per-field validation and account-lockout work from earlier phases, the public submit
endpoint (`POST /api/leads`) carries several layers of abuse resistance:

- **Honeypot**: the lead form ships a `companyWebsite` field, hidden off-screen and out of the tab
  order (`lead-form__honeypot`, `aria-hidden`) so sighted and screen-reader users alike never
  interact with it. A bot that blindly fills every field it finds in the DOM fills this one too;
  the backend silently accepts-but-drops any submission where it's non-empty, returning the same
  `201` a real submission gets rather than tipping off the scraper that it was caught.
- **CORS lock-down**: `CORS_ORIGIN` is a required env var (no default, no wildcard) - the API only
  ever answers cross-origin requests from the exact origin(s) listed there.
- **Payload limit**: `express.json({ limit: '10kb' })` in `app.ts` rejects oversized bodies before
  they're parsed - this API only ever needs a handful of short form fields.
- **Rate limiting**: `POST /api/leads` sits behind its own limiter (`RATE_LIMIT_MAX_REQUESTS` /
  `RATE_LIMIT_WINDOW_MINUTES`, defaulting to 5 requests per IP per 10 minutes, separate from the
  100/minute baseline limiter on the rest of the API), on top of the account-lockout mechanism on
  the admin login path. This was load-tested with 8 concurrent requests from the same IP: exactly
  5 came back `201` and the other 3 came back `429`, confirming the limiter counts correctly under
  real concurrent load rather than just sequential manual testing.
- **Dependency audit**: `npm audit` is clean on `frontend` (0 vulnerabilities). `backend` currently
  reports 4 high-severity findings, all in `mysql2` and `deepmerge-ts` - transitive dependencies of
  `@prisma/config`, which only the `prisma` CLI (a devDependency, used for `generate`/`migrate`)
  depends on. Neither `@prisma/client` nor `@prisma/adapter-pg` (the packages actually loaded by
  the running server) touch that dependency chain, so this is unreachable from the deployed app's
  request-handling path - a remote attacker hitting the public API cannot reach it. The only
  available fix (`npm audit fix --force`) would downgrade `prisma` from `7.10.0` to `6.19.3`, a
  major-version regression undoing the Prisma 7 + driver-adapter setup for a vulnerability this app
  never exposes; that trade isn't worth it. `.github/dependabot.yml` is wired up (weekly, both
  workspaces plus GitHub Actions) so a real fix lands automatically once Prisma ships one upstream.

Not included in this pass, per the plan doc's own guidance to add it "only if spam volume
warrants it": reCAPTCHA/Turnstile. The honeypot plus rate limiting are the first line of defense;
revisit this only if real spam shows up post-launch.

## Testing & CI/CD (Phase 8)

**Backend** (`backend/tests/`, Vitest + Supertest, 41 tests): unit coverage for services and
validation, and route-level integration tests that mock the Prisma repository layer and email
service so nothing here ever touches a real database or sends a real email. `tests/leads.test.ts`
covers the full public submit flow end-to-end - a valid submission, each validation failure mode,
the honeypot being silently dropped, and the rate limiter tripping - while `tests/auth.test.ts` and
`tests/adminLeads.test.ts` cover the admin login/session/lockout flow and the protected leads
routes.

**Frontend** (`frontend/src/**/*.test.tsx`, Vitest + React Testing Library, 14 tests, newly added
this phase): `LeadForm.test.tsx` covers rendering (including the hidden honeypot field), inline
validation errors, the submit button disabling mid-request, the success state, and the three
distinct error states (`rate_limited`, `network`, `unknown`) the form can show. `LoginPage.test.tsx`
covers the same shape for the admin login form, plus the post-login redirect (including back to
whatever protected page the admin originally tried to reach) and the already-authenticated
short-circuit. Getting this working needed one non-obvious fix: without vitest's `globals: true`,
React Testing Library's automatic per-test cleanup never registers, so `src/setupTests.ts` calls
`afterEach(cleanup)` explicitly - otherwise every test after the first sees every previous test's
still-mounted DOM.

**CI** (`.github/workflows/ci.yml`): two parallel jobs (backend, frontend), each running lint,
type-check, test, and build on every push and pull request to `main`. The backend job sets
CI-only placeholder values for the required env vars (`JWT_ACCESS_SECRET` and friends) directly in
the workflow - safe because, as above, the test suite never makes a real DB connection or a real
API call. **Deliberately not included yet**: an actual staging/production deploy step, since no
hosting platform has been chosen (that's Phase 9's job) - wiring one in now would mean guessing at
a target. This workflow gates code correctness; deployment gets wired in once hosting is decided.

## Industries (lead form categorization)

The public lead form's "Industry" field (Textiles, Steel & Metal Products, Food & Beverages, etc.
- distinct from the pre-existing "Business category" field, which classifies the *type* of
business - manufacturer/wholesaler/retailer/trader/services - not what it makes or sells) is backed
by an `Industry` table, not a hardcoded enum, so the list can be edited from the admin dashboard
without a code deploy:

- **Public**: `GET /api/industries` returns the active list, in display order, for the lead form's
  dropdown. The form fetches this on mount and disables submission until it loads (with a retry
  button on failure) - see `frontend/src/lib/industries.ts` and `LeadForm.tsx`.
- **Admin** (`/admin/industries`): every authenticated admin (including a `viewer`) can see the
  full list, active or not; only the `admin` role can add, rename, reorder, or deactivate one (see
  `requireRole` in `backend/src/middleware/auth.ts`). Deactivating hides an industry from the public
  form immediately without touching leads already submitted under it - there is deliberately no
  hard-delete endpoint, since that could orphan or cascade-delete real lead data.
- The submitted `industryId` is re-validated against the database on every submission (existence +
  active, not just UUID shape) - unlike `businessCategory`'s fixed six values, the valid set changes
  at runtime, so this can't be captured in a static Zod enum.
- Seeded with an initial ~30-industry list via `npm run prisma:seed` (upserts by slug, safe to
  re-run). New industries added later go in `prisma/seed.ts` only if they should ship with every
  fresh environment; day-to-day additions belong in the admin screen, not the seed file.

## Prisma 7 notes

Prisma 7 moved the database connection out of `schema.prisma` into `backend/prisma.config.ts`
(schema.prisma's `datasource` block only declares the `provider` now). The generated client lands
in `backend/generated/prisma` (gitignored, regenerated by `npx prisma generate` - never hand-edit
it) and is wired up via a `@prisma/adapter-pg` driver adapter in `src/lib/prisma.ts`, not the
`@prisma/client` default export.

## Status

Industries (lead form categorization) is done and verified: the `add_industries` migration has
been applied to the database, the Prisma client regenerated, and the initial 30-industry list
seeded. Both workspaces type-check and lint clean, the backend's Vitest suite (58 tests) and the
frontend's (23 tests) all pass, covering the public submit/validation path, the admin CRUD
endpoints and their `admin`-vs-`viewer` role restriction, and the dashboard/lead-detail/management
UI. Note for other environments: Prisma 7's `migrate dev` no longer runs `generate` or the seed
automatically - run `npx prisma generate` and `npm run prisma:seed` after it.

Phase 1 (this scaffold) is done and fully verified, including a real Prisma client generation:
both workspaces install cleanly (plain `npm install`, no flags needed), type-check, lint clean, the
backend compiles and its **compiled** `dist/src/server.js` boots and answers `GET /health`, its
automated tests pass, and the frontend builds to static assets. The only thing left before real
data can flow is a live `DATABASE_URL` for Phase 2 (migrations).

Phase 5 (email notifications) is done and verified live end-to-end: a real test submission
delivered the submitter confirmation via Resend's test domain (see "Email (Phase 5)" above for the
one remaining caveat - the admin alert needs either `ADMIN_NOTIFICATION_EMAIL` to match the Resend
account's own signup address, or a verified sending domain, before it will actually deliver).

Phase 6 (admin auth & dashboard) is done and verified live end-to-end: the `add_admin_auth_fields`
migration has been applied, the first admin account exists (created via
`scripts/create-admin.ts`), and a real browser session confirmed login, the leads table
(filters, sorting, pagination), the lead detail page (source IP, status dropdown), a status
update correctly appended to the audit history with the acting admin's email and a timestamp,
and that logging out revokes the session - a subsequent visit to a protected admin route
redirects back to `/admin/login`. Backend auth (login/refresh/logout/me, account lockout,
revocation via `tokenVersion`), the protected `GET/PATCH /api/leads*` routes, the
`scripts/create-admin.ts` CLI (including its explicit `--allow-weak-password` override for local
dev-only accounts), and the `/admin` frontend are all in place, with the backend's Vitest suite
(41 tests) and both workspaces' type-check/lint/build passing clean throughout.

Phase 7 (security & abuse hardening) is done and verified: the honeypot, CORS lock-down, and
10kb payload limit were already in place from earlier phases and have been re-confirmed; the
public submit endpoint's rate limiter was load-tested with real concurrent requests (5 of 8
succeeded, 3 correctly blocked with `429`, matching `RATE_LIMIT_MAX_REQUESTS=5`); and a dependency
audit found the frontend clean and the backend's only findings confined to Prisma's CLI tooling
(never loaded by the running server) - see "Security & abuse hardening (Phase 7)" above for the
full breakdown and why no forced downgrade was applied.

Phase 8 (testing & CI/CD) is done and verified: the frontend had zero test coverage going into
this phase (no Vitest/React Testing Library setup at all) - that infrastructure was added from
scratch, along with 14 new tests across the public lead form and the admin login form, all
passing. The root `npm run test`/`npm run lint`/`npm run typecheck` scripts now correctly cover
both workspaces (the root `test` script previously only ran the backend's). A GitHub Actions
workflow gates every push and pull request to `main` on lint, type-check, test, and build for both
workspaces - verified locally by running the backend suite in a completely isolated environment
(no `.env` file, only the exact placeholder values the CI workflow sets) to confirm it behaves
identically to how CI will run it. See "Testing & CI/CD (Phase 8)" above for the full breakdown.
Not included: an actual deploy step, since hosting hasn't been chosen yet (Phase 9).
