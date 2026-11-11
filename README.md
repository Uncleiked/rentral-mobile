# Rentral
Current web update: /admin now has focused review tabs and explicit gallery grant/
revoke controls. Email/password remains; direct Google sign-in is an optional
alternative. New web accounts choose Individual or Organization, with CAC evidence
and independent approval for organizations. Follow [the current setup audit](context/local-setup-audit.md)
and [Google setup](context/google-sign-in-setup.md). The new Google/organization
Mongo preparation has not been applied to the saved Atlas target. Do not follow
the separate old rentral project's Supabase instructions for this application.

Use npm.cmd run test:admin-ui for isolated responsive admin checks; ordinary
npm.cmd run test:e2e now targets this app on localhost:3000 by default. Keep one
backend process running from this folder to avoid serving an older build.

Expo Android/iOS app with a local Next.js backend, MongoDB, JWT email/password
accounts and private filesystem storage. Members enter Explore directly after
sign-in; personal KYC onboarding and mandatory profile completion are removed.

Owner administration is available at `/admin` and in the native Account screen.
Human document review, audited fee waivers and revocable gallery-uploader
permissions share the same server checks. Photo-only approved galleries need no
recording/GPS or Mux; videos still need processing. Follow [owner/admin setup](context/owner-admin-setup.md).

Ordinary recorded listings use a server-acknowledged GPS capture, immutable
video upload/digest binding and a required Geoapify address check before submission.
The minimalist Rentral identity includes generated icon assets and an accessible
native launch reveal. Follow [location setup](context/recording-location-setup.md)
and [Mux credential/local webhook setup](context/mux-local-setup.md).

Source and local validation are complete, including native owner publication-fee
checkout, status and reconciliation with durable recovery. See
[current status](context/completion-status.md) for verified results and the
separate device/provider release boundaries.

Use **Node 24.x and npm 11.19.1**. The npm workspace contains the web/API backend
and `apps/mobile`. Prisma is pinned to 6.19.3 for its MongoDB connector. Supabase,
PostgreSQL/PostGIS, pnpm and OPay are outside the active implementation.

## Start locally

Follow the [step-by-step environment guide](context/environment-setup.md), keeping
the existing private files and saved Atlas connection. For a fresh checkout:

```powershell
npm.cmd install
npm.cmd run setup:local
npx.cmd prisma generate
npm.cmd run env:check
```

`setup:local` fills missing local defaults and preserves nonempty settings.
`env:check` checks file formats offline; it does not connect to MongoDB or validate
provider permissions. MongoDB needs replica-set transactions and reviewed setup.
Do not use `prisma db push` or replay historical SQL migrations.

After reviewing and authorizing preparation of the selected database:

```powershell
# Saved Atlas: deliberately prepare that remote target.
npm.cmd run db:setup -- --allow-remote
# Chosen local replica set instead: npm.cmd run db:setup
```

The supplied `compose.mongodb.yml` is an optional local replica-set source; it
does not replace a saved Atlas connection. Setup applies indexes, validators and
readiness markers without importing or resetting application data. See the guide
before running it against any existing database.

Only if you deliberately chose a new local MongoDB connection:

```powershell
docker compose -f compose.mongodb.yml up -d
docker compose -f compose.mongodb.yml exec mongodb mongosh --quiet --file /bootstrap/init-local-mongo.js
npm.cmd run db:setup
```

These commands do not change the saved Atlas URI; do not substitute a different
database merely to hide a connectivity/setup error.

Keep one backend and one Expo process running in separate terminals:

```powershell
# Terminal 1: backend on port 3000
npm.cmd run dev
# Terminal 2: mobile bundle, normally on port 8081
npm.cmd run mobile
```

Open `http://localhost:3000` on the computer. Set `EXPO_PUBLIC_API_URL` in
`apps/mobile/.env.local` to the backend origin reachable from the device, without
`/api/v1`, then restart Expo. A physical phone normally uses
`http://YOUR_COMPUTER_LAN_IP:3000`; Android emulators use `http://10.0.2.2:3000`.
An Expo tunnel serves the bundle, not the separate backend. The iOS simulator
requires macOS/Xcode. See [mobile setup](apps/mobile/README.md) and
[network troubleshooting](context/local-development.md).

## Implemented workflows

- Discovery filters and walkthroughs, public host profiles, saved listings/searches,
  owner inventory, native camera/GPS capture, drafts, editing and private vault.
- Booking quotes, requests, host decisions, inspection check-in, paid-hold credit,
  history, lease extensions and reviewed early termination.
- Participant messaging, listing shares, unread/read state, activity controls,
  reviews, reports, safety appeals and notifications.
- Opt-in Squat-Mates preferences, mutual contact, blocking/reporting, and consented
  coarse Insights with privacy thresholds and reviewed sponsored placement.
- Password/session controls, dual-confirmed email change, optional Resend recovery,
  soft account closure and bounded data exports. Historical verification never
  grants staff permission; roles come from the current database account.
- Staff web workspaces for listing/safety review, finance, matching and lifecycle
  decisions; Paystack-only collections, recipients, independently approved
  refunds/payouts and explicit uncertain-outcome reconciliation.

Shared domain services enforce ownership, active-account checks, reservation
overlap, exact kobo journals and durable request/media claims. Private files use
scoped short-lived URLs with Range/HEAD support; raw GPS and mail outboxes remain
private. Asset evidence, advisory screening and human publication review remain
separate from the removed personal KYC flow. Web/native Inter fonts are bundled
locally, so startup and web compilation do not download Google Fonts.

## Optional services and operations

Basic local accounts and uploads do not need provider keys. Keep optional
payments/settlement, commercial purchases, email, push, Mux, workers, analytics
and monitoring disabled until deliberately configured and accepted. Only the API
origin and optional public EAS project UUID belong in mobile public settings;
all database, signing, encryption and provider secrets stay on the backend.

Provider-ready source and controlled tests do not prove actual delivery, merchant
custody permissions, refunds, payouts or physical-device readiness. No live money,
provider activation, deployment, EAS build or store submission is implied.

See [Paystack](context/paystack-integration.md), [account security](context/account-security.md),
[push](context/push-operations.md), [media processing](context/media-processing.md),
[document providers](context/document-providers.md),
[commercial access](context/commercial.md), and [backup operations](context/backup-operations.md).
Backup verification restores only to an isolated quarantined local target; it
does not perform a production cutover. The original PostgreSQL database and
existing user assets remain outside cleanup/reset operations.

## Verification

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run mobile:typecheck
npm.cmd exec --workspace @rentral/mobile -- expo install --check
npm.cmd exec --workspace @rentral/mobile -- expo export --platform all
npm.cmd run test:mongo
npm.cmd run build
npm.cmd run test:browser
```

`test:mongo` creates and removes its own labeled loopback replica fixtures; it
does not select the application database. Run resource-heavy builds/fixtures
sequentially. [The progress tracker](context/progress-tracker.md) records current
acceptance and remaining handoff checks; [the final review](context/final-review.md)
records the passed unit/Mongo, production build, exports and browser journeys.
Final acceptance includes **1,678 unit checks**, **89 owned Mongo checks**, the
production build, Android/iOS/web exports, six production web journeys and native
fee browser checks. Clean diagnostic-off runtime handback passed on the first
request; staged review and authorized commit/push are separately confirmed from
Git. A public release needs a reachable HTTPS
backend/origin and its own provider/device acceptance.
Real Android/iOS capture, GPS, permissions, background behavior, playback,
accessibility and real-provider acceptance require their own evidence.

For reproducible production browser acceptance, start Docker Desktop and use an
installed Chrome, then run `npm.cmd run build` followed by `npm.cmd run test:browser`.
Ordinary builds reuse an unchanged, successfully generated Prisma client. If the
schema or Prisma installation changed, stop this checkout's Next server before
building on Windows so regeneration can replace its engine DLL. The tracked [wrapper](scripts/test-browser.mjs) and
[fixture config](playwright.fixture.config.mjs) provision their own labeled
loopback Mongo/synthetic accounts, block providers and clean owned resources;
they do not use the saved application database or rewrite private env files.
Keep builds/generation and fixture runs sequential. Results stay in ignored
`test-results`. See [the environment guide](context/environment-setup.md).

Read [current architecture](context/architecture.md),
[the approved completion blueprint](context/remaining-work-blueprint.md), and
the context order in `AGENTS.md`. Historical design sections do not override the
current stack or restore onboarding/provider assumptions.

### Windows build preparation

Run npm.cmd run build (or npm run build in a shell where npm is enabled).
The build runner generates Prisma on a fresh installation or whenever schema,
configuration, installed tools, generation flags or generated artifacts change.
It reuses an unchanged client only after an earlier successful generation has
recorded its inputs and every generated-file digest. This ignored proof lives in
node_modules/.cache/rentral/prisma-build.json; deleting node_modules naturally
invalidates it. Do not seed that file manually or disable native engine generation.

Windows locks a Prisma DLL while a Next server uses it. If regeneration is needed,
stop this checkout's dev/start terminal with Ctrl+C, build, then restart. Ordinary
unchanged-schema builds can run alongside the development server. The build never
kills processes, applies database setup or edits private environment values.