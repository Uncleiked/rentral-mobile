# Rentral isolated environment preparation

Current stack, 2026-11-09: Node 24.x, npm 11.19.1 workspaces, Next.js 16.4.5,
Prisma 6.19.3 with MongoDB, local JWT accounts and private filesystem storage.
The app and backend run locally; the user selected their saved Atlas database
for application use. This guide does not deploy an environment or authorize
changes to the configured Atlas database. Supabase, PostgreSQL migration commands,
Didit onboarding and OPay are retired from the active implementation.

Use [the environment guide](environment-setup.md) for every variable and
[local troubleshooting](local-development.md) for the existing runtime. Preserve
all current private settings, signing/encryption keys, user files and data.

## Create an isolated configuration

For a fresh test environment, choose a separate MongoDB database with replica-set
transactions and a separate absolute private storage directory. Use synthetic
accounts/files, never a production identity or a copy of private customer evidence.
Give this environment its own JWT and encryption keys. Do not weaken MongoDB TLS
verification or expand Atlas network access to all addresses.

The tracked `.env.staging.example` is a placeholder reference. There is currently
no supported staging launcher that selects `.env.staging`; Next normally reads
`.env.local`, so copying that filename alone does not select a safe target. Use an
explicitly isolated checkout/runtime and supply reviewed process environment
values through your local launcher or secret manager. Never fall back to the
existing application's database/storage while testing. Do not edit or overwrite
the current checkout's private files to select a disposable target.

Required backend settings are `MONGODB_URL`, a private `JWT_SECRET`, the matching
`NEXT_PUBLIC_APP_URL` origin, and `RENTRAL_STORAGE_DIR`. A database omitted from
the URI uses `MONGODB_DB_NAME` or the application default `rentral`; select an
explicit isolated database name to avoid confusing targets. No secret or MongoDB
URI belongs in a mobile public variable, log, screenshot or source file.

For a phone, `EXPO_PUBLIC_API_URL` must reach that backend from the device; a
computer's localhost address is not the phone's localhost. The only other public
mobile setting is the optional `EXPO_PUBLIC_EAS_PROJECT_ID` UUID for device push.

## Keep optional integrations disabled

Start with these settings. Setting keys is not permission to enable a provider.

```dotenv
PAYMENTS_ENABLED=false
SETTLEMENT_ENABLED=false
PAYSTACK_TRANSFERS_ENABLED=false
PAYSTACK_REFUNDS_ENABLED=false
COMMERCIAL_ENABLED=false
MUX_ENABLED=false
MEDIA_WORKER_ENABLED=false
LIFECYCLE_WORKER_ENABLED=false
AUTH_EMAIL_ENABLED=false
NOTIFICATION_EMAIL_ENABLED=false
PUSH_NOTIFICATIONS_ENABLED=false
RENTRAL_ANALYTICS_ENABLED=false
NEXT_PUBLIC_POSTHOG_ENABLED=false
OLUSO_ENABLED=false
```

Use `PAYSTACK_ENVIRONMENT=test` for separately approved controlled provider tests.
Keep live credentials absent. `AUTH_DEV_EMAIL_OUTBOX=true` permits local recovery
codes in the private storage directory without sending email; that outbox must
never be served publicly. Leave optional Gemini/Geoapify credentials absent until
their controlled evidence/privacy tests are deliberately selected.

## Prepare and verify the selected database

Install with `npm.cmd install`, then generate with `npx.cmd prisma generate`.
Generation does not prepare a database. A MongoDB replica set is required; the
source-only `compose.mongodb.yml` provides a local development option. Review the
chosen target before any setup command.

`npm.cmd run db:setup` applies reviewed collections, validators, partial unique
indexes and feature readiness markers. Remote setup additionally requires the
deliberate `--allow-remote` opt-in and authorization for that exact target. It is
not a test, may alter database metadata, and must not be run against the existing
Atlas target merely to validate a checkout. Runtime fails closed when required
setup is absent. Never use `prisma db push`, `prisma migrate deploy`, or archived
PostgreSQL SQL files with this MongoDB implementation. A quarantined restore is
explicitly refused by ordinary setup and cannot be made a live app by this command.

Start the isolated backend with the reviewed process settings, then the single
mobile Metro process. Validate unauthenticated access denial, registration/login,
password recovery, participant/owner/staff restrictions, file signatures/ranges,
and no personal KYC redirect. Use test accounts you own. Do not bootstrap a real
staff role as a side effect of testing; role assignment is a separate audited
operator action.

## Automated acceptance and provider review

`npm.cmd run test:mongo` provisions uniquely owned local containers and synthetic
databases without selecting the application database. Run only one resource-heavy
fixture/build sequence at a time. `npm.cmd test`, root/mobile type checks, lint,
production compilation and native exports provide different evidence; record
their actual results in [the progress tracker](progress-tracker.md).

Provider integration source and controlled fixtures do not establish live
acceptance. Paystack collection/transfer/refund permissions and custody/fee policy
require separate review; unknown outcomes require reconciliation. Resend needs a
verified sender and encrypted outbox configuration. Push needs a real development
device build, EAS configuration and receipt handling. Mux needs signed playback,
webhook and unknown-create recovery acceptance. Gemini/Geoapify remain advisory;
human review controls publication. Follow [Paystack](paystack-integration.md),
[document providers](document-providers.md), [backup operations](backup-operations.md)
and the [completion blueprint](remaining-work-blueprint.md) for those boundaries.

Before any release, separately verify physical Android/iOS permissions, capture,
uploads, GPS, playback, accessibility, background/reconnect behavior and recovery.
No EAS build, store submission, live charge, payout, email or push is performed by
this guide.
