# Rentral

Lagos-first rental marketplace for properties, vehicles and boats. Built with
Next.js 16, React 19, strict TypeScript, Tailwind CSS v4, Supabase Auth/Storage,
Prisma/Postgres/PostGIS, Didit identity verification and PostHog.

## Current State

The responsive web implementation now includes a GSAP homepage, advanced discovery,
grid/walkthrough views, listing details and saves, a cross-device Media Vault,
booking requests and GPS/code check-in, Paystack collection and payment history,
private messaging, reviews/disputes, human document review, notifications/renewals,
staff operations and consent-based aggregate insights. Active dashboards no longer
use fabricated financial/lease data. New domains remain disabled until migrations
and provider acceptance have passed in a separate staging environment.

This is not a production-complete financial service. OPay integration, actual
refund/payout execution, hold-credit conversion and automatic default splits still
need approved provider contracts and implementation/acceptance. Squat-Mates AI is
explicitly deferred. See [release readiness](context/release-readiness.md).

Start with the [step-by-step staging guide](context/staging-setup.md) and the blank
[staging template](.env.staging.example). Keep credentials in the ignored
`.env.staging` file and use `pnpm staging ...` to avoid mixing project credentials.

Read [the architecture and delivery plan](context/production-plan.md) and
[the progress tracker](context/progress-tracker.md) before starting a task.
Follow AGENTS.md's context-reading order.

## Local Development

Use Node 22.23.1 or compatible and pnpm. Keep secrets in the ignored local environment
file. Use the existing project's Supabase connection settings, not placeholder values.

```sh
pnpm install
pnpm exec prisma generate
pnpm dev
```

The default preview is http://localhost:3000. Use `pnpm dev --port 3100` when occupied.
For camera/GPS testing from a phone, use `pnpm dev:https` and trust the local certificate
on the device. A plain HTTP LAN address cannot grant camera/geolocation permissions.

## Configuration

| Purpose | Environment variables |
| --- | --- |
| Supabase browser/auth | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY |
| Server administration | SUPABASE_SERVICE_ROLE_KEY |
| Database runtime/migrations | DATABASE_URL, DIRECT_URL |
| Callback origin | NEXT_PUBLIC_APP_URL |
| Identity verification | DIDIT_API_KEY, DIDIT_WEBHOOK_SECRET, DIDIT_KYC_WORKFLOW_ID, DIDIT_KYB_WORKFLOW_ID, DIDIT_ORDERING_ENABLED |
| Analytics | NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, NEXT_PUBLIC_POSTHOG_HOST |
| Optional local analytics | NEXT_PUBLIC_POSTHOG_ENABLED=true (local default is disabled) |
| Video processing | MUX_ENABLED, MUX_TOKEN_ID, MUX_TOKEN_SECRET, MUX_WEBHOOK_SECRET, MUX_SIGNING_KEY_ID, MUX_SIGNING_PRIVATE_KEY |
| Background media worker | MEDIA_WORKER_ENABLED (default disabled), MEDIA_WORKER_SECRET (separate random secret) |

Use the Supabase dashboard to configure OAuth providers, allowed callback URLs and SMTP.
Didit needs a reachable HTTPS webhook at `/api/webhooks/didit`.
Provider credentials being present does not prove the provider flow works.
Missing Mux, Gemini and payment configuration is tracked in the delivery plan.
Mux integration code is present but disabled until staging acceptance. Follow
[the media staging runbook](context/media-staging.md); adding keys alone is not
sufficient to enable it. Never turn it on before the schema and callbacks are tested.
The worker endpoint is `POST /api/internal/media-worker`. It resumes queued jobs and
reconciles known Mux assets; it never blindly retries ambiguous submissions. An
external scheduler must be configured after staging acceptance. No schedule is
installed automatically. Its authorization, activation and monitoring instructions
are in the media staging runbook.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:database
pnpm exec prisma validate
pnpm build
```

Run type generation/build sequentially, separately from a running dev server, to avoid
conflicting generated Next.js validator files. The production build fetches the
configured Google Font and requires network access.

Browser tests use installed Google Chrome and an already running app:

```sh
pnpm dev --port 3100
# In a second terminal:
pnpm test:e2e
```

Set `PLAYWRIGHT_BASE_URL` for a different preview URL. Checks cover desktop, tablet,
390px and 320px mobile viewports; screenshots/traces go into ignored `test-results/`.
Unit tests mock external services and do not prove live database/provider behavior.

`pnpm test:database` replays migrations and exercises actual PostgreSQL availability,
ledger, private-chat/Realtime and Storage constraints in a labelled, isolated Docker
container. It never imports `.env` or contacts the configured Supabase database.
See `scripts/test-platform-database.ts` for its ownership and reset guards.

For a fresh local test environment, create the isolated container without exposing
any database ports, then run the suite (the password is only a local disposable fixture):

```sh
docker run --detach --name rentral-platform-test --label rentral.task=platform-verification --env POSTGRES_PASSWORD=rentral_local_test_only postgis/postgis:17-3.5
pnpm test:database
```

If that task-owned container already exists but is stopped, use
`docker start rentral-platform-test` instead of creating another one.

The mobile-ready versioned JSON boundary is documented in
[the API contract](context/mobile-api.md). Web Server Actions and API routes share
domain services; no mobile app or authentication-provider rewrite was introduced.

`pnpm test:storage` runs the media-bucket migration and RLS assertions against an
isolated temporary local PostgreSQL fixture. Requires `initdb`, `pg_ctl` and `psql`.
It does not use your application database, Supabase credentials or hosted Storage.

A read-only metadata audit is available:

```sh
node --experimental-strip-types scripts/audit-database.ts
```

It reads permissions and constraints, not user records. Database connectivity is
restored. The audit still reports profile-table grants requiring staging review.

## Database Changes

Prisma migrations in `prisma/migrations/` are the source of truth.
Use staging to verify clean replay and existing-data upgrades before deploying.
Do not use `prisma db push` on shared environments.

The new `20260924130000_harden_profile_access` migration is prepared but unapplied.
It restricts private profile-table access and the signup trigger.
Review and validate it against staging before `pnpm exec prisma migrate deploy`.
The media migration `20260924150000_add_mux_media_pipeline` is also unapplied.
The private-bucket migration `20260924170000_private_listing_media` is prepared
but unapplied. Authorized preview routes must be deployed first; follow the
[private media cutover plan](context/private-media-plan.md). Existing public files
remain exposed until cutover, and previously cached/downloaded copies need review.
