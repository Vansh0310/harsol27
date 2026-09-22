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
npm run test             # backend tests (vitest)
```

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

## Prisma 7 notes

Prisma 7 moved the database connection out of `schema.prisma` into `backend/prisma.config.ts`
(schema.prisma's `datasource` block only declares the `provider` now). The generated client lands
in `backend/generated/prisma` (gitignored, regenerated by `npx prisma generate` - never hand-edit
it) and is wired up via a `@prisma/adapter-pg` driver adapter in `src/lib/prisma.ts`, not the
`@prisma/client` default export.

## Status

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
