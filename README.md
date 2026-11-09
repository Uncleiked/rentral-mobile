# Rentral

Expo Android and iOS app with a local Next.js backend, MongoDB, email/password JWT authentication, and private local file storage. KYC onboarding has been removed: members enter Explore after signing in, and profile edits are optional.

Use Node 24.x and npm 11.19.1. The repository uses npm workspaces and `package-lock.json`. Supabase is no longer part of the application.

The user-authorized source delivery repository is
[Uncleiked/rentral-mobile](https://github.com/Uncleiked/rentral-mobile).
Deployment and app-store publication are outside this local delivery.

## Start locally

From the repository root:

~~~powershell
npm install
npm run setup:local
~~~

`setup:local` fills missing local settings in the ignored `.env.local`: a MongoDB URL, a random backend JWT secret, `NEXT_PUBLIC_APP_URL=http://localhost:3000`, `AUTH_DEV_EMAIL_OUTBOX=true`, and `RENTRAL_PLATFORM_ENABLED=true`. It preserves existing nonempty values. Never put database connections or JWT secrets in Expo public variables.

MongoDB must run as a replica set because reservations, payments, messages, and password resets use transactions. For a new local database:

~~~powershell
docker compose -f compose.mongodb.yml up -d
docker compose -f compose.mongodb.yml exec mongodb mongosh --quiet --file /bootstrap/init-local-mongo.js
~~~

This binds MongoDB to `127.0.0.1:27017`, uses replica set `rs0`, and keeps data in a named Docker volume. The local connection format is:

~~~text
mongodb://127.0.0.1:27017/rentral?replicaSet=rs0&directConnection=true
~~~

If `.env.local` already contains a different `MONGODB_URL`, setup preserves it. Choose the local connection explicitly for an entirely local installation. No existing database is imported, reset, or replaced automatically.

Then prepare indexes/validators and start the backend:

~~~powershell
npm run db:setup
npm run dev
~~~

Open http://localhost:3000. `db:setup` requires a local database by default. A remote setup requires a separate explicit manual override and is outside this local workflow. Runtime database operations fail closed until the current setup marker exists; enabling the platform flag alone is insufficient. Do not use `prisma db push` or replay the historical SQL migrations.

In a second terminal:

~~~powershell
npm run mobile
~~~

Scan the Expo QR code with an SDK-compatible Expo Go app, or use the Android emulator. The iOS simulator requires macOS/Xcode. See [mobile setup](apps/mobile/README.md).

## Configuration

| Backend setting | Purpose |
| --- | --- |
| `MONGODB_URL` | Canonical MongoDB connection; `DATABASE_URL` is a compatibility fallback. |
| `JWT_SECRET` | Backend-only random signing secret, at least 32 bytes. Setup generates one. |
| `NEXT_PUBLIC_APP_URL` | Local web origin, normally `http://localhost:3000`. |
| `RENTRAL_PLATFORM_ENABLED` | Enables prepared marketplace domains; database readiness is checked separately. |
| `RENTRAL_STORAGE_DIR` | Optional private filesystem root; defaults to `storage` in the workspace. |
| `AUTH_DEV_EMAIL_OUTBOX` | Opt-in development password-reset codes in private `storage/mail-outbox`. |
| `OLUSO_ENABLED`, `OLUSO_API_KEY` | Optional monitoring; starts only with explicit `OLUSO_ENABLED=true` and a key. Neither is required for local startup. |

The mobile app normally discovers the Expo development computer and uses its backend on port 3000. The only optional public mobile setting is `EXPO_PUBLIC_API_URL`, an origin without `/api/v1`. Android-emulator fallback is `http://10.0.2.2:3000`; iOS simulator/web fallback is localhost. A physical phone needs the computer's reachable LAN address and firewall access. See [API contracts](context/mobile-api.md).

Oluso monitoring is optional and disabled without both an explicit enable flag
and its backend key. An unconfigured monitoring service must not prevent the app
from starting. Keep monitoring/provider keys out of mobile public settings.

## Accounts and files

Create an account with email and password; email delivery and OAuth are not required for local sign-in. Passwords are salted scrypt hashes. Access JWTs last 15 minutes and are checked against a private MongoDB session on every authenticated request. Refresh credentials last at most 30 days, are stored as hashes on the backend, and rotate once per use. Staff permissions come from the current database account.

Development password recovery writes a one-use code to the private backend email outbox when enabled. Enter that code in Reset password on web or mobile. These files are never served through the upload API. Production recovery delivery is not configured and returns an explicit unavailable response.

Uploads use authenticated HTTP endpoints and local `listings-media`, `compliance-docs`, and `profile-avatars` directories. Private playback/download URLs use short-lived purpose-bound JWTs; file reads support byte ranges. Supporting ownership documents belong to listing review and are not personal KYC onboarding. Actual iOS MOV, Android MP4, and web WebM formats retain their truthful MIME types.

Existing historical verification fields remain factual; bypassing onboarding never marks an account verified. Legacy `/onboarding` redirects and `/api/verify` returns 410.

## Implemented scope and limits

Native Explore/search/filtering, listing details/video, saved listings, booking requests/history, inbox/chat, optional account edits, owner inventory, and camera/GPS/document listing submission share backend domain services with the web app.

Booking cards open the local web app for existing host actions, inspection check-in, and optional provider checkout. Existing web drafts can be resumed on web. Native booking requests and listing submissions must be refreshed after ambiguous failures before retrying; message UUID retries are idempotent.

Publication still requires the existing asset-document, location, media, staff, and payment checks. Provider integrations remain separately gated. Collection receipts do not prove custody, refunds, payouts, escrow, or default compensation. No provider was activated, historical data imported, hosted database modified, deployment performed, or store build/submission run.

## Verification

~~~powershell
npm test
npm run lint
npm run typecheck
npm run mobile:typecheck
npm exec --workspace @rentral/mobile -- expo install --check
npm exec --workspace @rentral/mobile -- expo export --platform all
npm run test:mongo
npm run build
~~~

`test:mongo` creates and destroys its own labeled, loopback-only MongoDB replica fixture; it never selects the application's database. Final verification results and device/provider limits are recorded in [the implementation record](context/expo-implementation.md) and [progress tracker](context/progress-tracker.md). Real Android/iOS camera, GPS, permissions, playback, and device acceptance remain required. Next.js 16.4.5 includes the reviewed security update; this local implementation is not a production release certification.

Confirmed checks: 583 tests across 58 files, 16 real Mongo integration checks, 34
localhost HTTP checks, clean lint, native typecheck/compatibility, Expo Doctor 20/20,
and Android/iOS/web export. Production build passed with strict TypeScript and
48 generated static pages. The configured Inter font requires network access
during a fresh web build.

`npm audit --omit=dev` still reports eight toolchain dependency advisories:
three high in Prisma CLI/config/deepmerge paths and five moderate in Expo
CLI/fingerprint/glob/minimatch paths. Supported updates remain a follow-up; do not
force a breaking Prisma 7 or incompatible Expo change to hide these findings.

Read [current architecture](context/architecture.md) and follow the context order in `AGENTS.md`. Earlier PostgreSQL/Supabase design and deployment notes are historical; the original README is archived in [legacy-web-readme.md](context/legacy-web-readme.md).
