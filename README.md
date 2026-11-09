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

Keep the saved `MONGODB_URL` unless you deliberately choose a different database.
MongoDB must support replica-set transactions. Choose the setup for that connection:

**Saved MongoDB Atlas:** allow the backend computer's current public IP in the
Atlas project's Network Access list. This is the computer network's public egress
IP, not the phone's or computer's private LAN address. Follow
[Atlas IP access-list instructions](https://www.mongodb.com/docs/atlas/security/ip-access-list/).
After network/TLS access works and you intend to prepare that saved database, run:

~~~powershell
npm run db:setup -- --allow-remote
~~~

This explicitly prepares indexes, validators and the readiness marker in the
selected database. It does not import, reset or replace existing data. Keep TLS
certificate verification enabled. The current phone/Atlas troubleshooting status
is in [local development](context/local-development.md).

**New local MongoDB, if selected:**

~~~powershell
docker compose -f compose.mongodb.yml up -d
docker compose -f compose.mongodb.yml exec mongodb mongosh --quiet --file /bootstrap/init-local-mongo.js
~~~

This binds MongoDB to `127.0.0.1:27017`, uses replica set `rs0`, and keeps data in a named Docker volume. The local connection format is:

~~~text
mongodb://127.0.0.1:27017/rentral?replicaSet=rs0&directConnection=true
~~~

`setup:local` preserves an existing nonempty connection. If you chose this local
replica set, prepare it with:

~~~powershell
npm run db:setup
~~~

Runtime database operations fail closed until preparation succeeds; enabling the
platform flag alone is insufficient. Do not use `prisma db push` or replay the
historical SQL migrations.

**Terminal 1 — keep the backend running:**

~~~powershell
npm run dev
~~~

The backend listens on `0.0.0.0:3000`; open http://localhost:3000 on the computer.
Keep port 3000 available because the native app uses that API address.

**Terminal 2 — keep Expo running:**

~~~powershell
npm run mobile
~~~

Expo normally serves the JavaScript bundle on port 8081. It does not start the
backend on port 3000. Scan its QR code with SDK-compatible Expo Go, or use an
Android emulator. The iOS simulator requires macOS/Xcode. See
[mobile setup](apps/mobile/README.md).

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

Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env.local` to an origin without
`/api/v1`, then restart Expo:

| Device | Explicit API address |
| --- | --- |
| Physical Android/iPhone | `http://YOUR_COMPUTER_LAN_IP:3000` on the same reachable network. |
| Android emulator | `http://10.0.2.2:3000` |
| iOS simulator | `http://localhost:3000` |
| Web preview on this computer | `http://localhost:3000` |

A usable local Expo host may be detected in development. Native loopback,
missing-host and tunnel configurations require an explicit device-reachable API
address; there is no automatic emulator fallback. An Expo tunnel forwards the
app bundle, not the separate API on port 3000. A phone's localhost is the phone.
See [network/Atlas troubleshooting](context/local-development.md) and
[API contracts](context/mobile-api.md).

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

Publication still requires the existing asset-document, location, media, staff, and payment checks. Provider integrations remain separately gated. Collection receipts do not prove custody, refunds, payouts, escrow, or default compensation. The initial isolated delivery made no hosted database writes. A later user-authorized Atlas setup prepared indexes/validators without a reset or legacy-data import; current account-flow status is in [runtime troubleshooting](context/local-development.md). The original PostgreSQL database remains untouched. No provider activation, deployment or store build/submission was run.

## Verification

Registration after a fresh backend restart completed in12.4 seconds. Real phone
sign-in, profile editing and marketplace/member requests now succeed against the
user-selected Atlas database. See [runtime evidence](context/local-development.md).

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

Latest checks:636 tests across61 files,16 owned local Mongo integration checks
after the timeout fix, clean lint and root/mobile typechecks. Initial delivery
also passed34 localhost HTTP checks, Expo Doctor20/20, Android/iOS/web export and
production build with48 static pages. The configured Inter font requires network
access during a fresh web build. Camera/GPS and provider acceptance remain separate.

`npm audit --omit=dev` still reports eight toolchain dependency advisories:
three high in Prisma CLI/config/deepmerge paths and five moderate in Expo
CLI/fingerprint/glob/minimatch paths. Supported updates remain a follow-up; do not
force a breaking Prisma 7 or incompatible Expo change to hide these findings.

Read [current architecture](context/architecture.md) and follow the context order in `AGENTS.md`. Earlier PostgreSQL/Supabase design and deployment notes are historical; the original README is archived in [legacy-web-readme.md](context/legacy-web-readme.md).
