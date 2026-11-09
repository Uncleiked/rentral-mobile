# Rentral Expo and local backend implementation

Current authority: 2026-11-09. Use the linked Rentral repository for Expo on Android and iOS, remove KYC onboarding, use npm, move database/user information to MongoDB with local JWT authentication, and run the application locally. Earlier Supabase/PostgreSQL, pnpm, staging, OAuth, and mandatory-verification instructions are superseded.

## Delivered architecture

- `apps/mobile`: Expo SDK 58, Expo Router, React Native, strict TypeScript, bundled Inter and semantic native theme tokens.
- Root Next.js 16.4.5 / React 19 web app and versioned API remain one backend. Native code receives public projections and bearer JWTs, never Prisma or server secrets.
- MongoDB through Prisma 6.19.3; Prisma 7's MongoDB support is not available for this implementation. npm 11.19.1 workspaces and Node 24.x replace pnpm.
- Local email/password authentication with salted `scrypt-v1` hashes (`N=32768, r=8, p=3`), 15-minute access JWTs, and private hashed, one-use rotating refresh credentials with a 30-day session lifetime.
- Current database sessions and `User.staff_role` determine access; editable profile metadata and historical KYC records grant no permissions.
- Local filesystem uploads, path/owner checks, actual MIME/extension/magic validation, immutable object paths, and short-lived purpose-bound JWT downloads with Range/HEAD support.
- Complete KYC forms/initiation/gates removed. Legacy onboarding redirects, verify initiation returns 410, and existing verification fields remain truthful without fabricating approved accounts.

Native screens cover discovery/search/filtering, details/video, saves, bookings/history, inbox/chat, optional profile edits, owner inventory, and camera/GPS/document submission. Booking status actions, inspection check-in and optional checkout link to web. Existing web drafts resume on web.

## Data and transaction boundaries

`lib/database/transactions.ts` uses actual revision writes to serialize competing transactions with bounded conflict retries. Rental/hold overlap checks run under the common listing lock and include awaiting-payment, confirmed and disputed reservations.

Provider receipt, payment state, balanced integer-kobo ledger and booking confirmation commit atomically. Paid hold credit binds the same asset/parties/dates/currency, a recorded collection receipt, and an exact remaining balance; an allocation is immutable and consumed once. Provider HTTP stays outside retried database callbacks.

Private capture GPS is stored in `ListingLocation`, separate from default public listing fields. Location comparison uses bounded GeoJSON and a documented Haversine approximation; it does not claim PostGIS spheroid behavior. Discovery uses Mongo aggregation and retains explicit public projections. Insights require at least ten distinct monthly contributors.

Mongo setup creates reviewed indexes, partial nullable-unique indexes, validators and a final readiness marker. Runtime operations fail closed before preparation. Cross-document financial invariants live in services; central Prisma guards reject direct/nested mutation of immutable records. Raw privileged Mongo access is outside that application guard.

Historical PostgreSQL migrations, including the source QuickTime bucket migration, are retained as historical evidence and are not active Mongo setup. No old data was imported, hosted database written, provider activated, deployment performed, or EAS/store build/submission run. The user authorized source commit/push delivery to [Uncleiked/rentral-mobile](https://github.com/Uncleiked/rentral-mobile); Git history/remote and the final delivery response record its outcome.

## Local workflow

See [root setup](../README.md), [mobile setup](../apps/mobile/README.md), and [API contracts](mobile-api.md).

`npm run setup:local` preserves existing nonempty settings while filling missing local authentication/platform values. The existing ignored MongoDB connection was preserved; no credential or URI is recorded here. Use the supplied local replica-set compose file for an entirely local database, then `npm run db:setup`. Database setup is local by default and is separate from builds.

`EXPO_PUBLIC_API_URL` is the only optional mobile public setting. Development normally discovers the Expo computer; Android emulator fallback uses 10.0.2.2, iOS/web localhost, and physical devices require a reachable LAN address.

Development reset codes are in the private storage email outbox with explicit opt-in. Native/web accept those codes. Production delivery is unavailable and returns 503.

## Verification record

Confirmed at the final verification checkpoint:

- `npm test`: 583 tests across 58 files passed. The 16 fixture integration tests are skipped by the ordinary run and were executed separately.
- Isolated local MongoDB replica fixture: 16/16 passed. Coverage includes reservation/payment/hold/message races, balanced immutable ledgers, private GPS, monthly privacy thresholds, readiness/nested guards and actual JWT account/rotation/reset/revocation behavior.
- Actual local Next.js + MongoDB HTTP fixture: 34 checks passed, including no-KYC JWT/profile access, uploads/fresh capture GPS, discovery, signed MOV206/HEAD, saves/messages/bookings isolation, browser-cookie/proxy refresh, CSRF/bearer precedence, private-outbox404, reset and logout.
- All HTTP fixture processes/containers were cleaned up and generated Next files restored. The ignored local report is `test-results/localhost-d6caf8d21aa8/report.json`; it is not committed fixture data.
- Root lint clean; mobile strict typecheck and Expo dependency compatibility passed; Expo Doctor 20/20 passed. Android/iOS Hermes bundles (about 3 MB each) and web export passed.
- Scanned 85 exported artifacts for the actual private JWT/Mongo/database values: zero matches. This checks the configured values, not every possible future secret.
- `npm run build` passed: Next.js 16.4.5 compilation, strict TypeScript and 48 generated static pages. The configured Inter font requires build-time network access; the network-enabled retry completed without a source workaround.

The earlier mocked Supabase browser transport smoke predates local JWT migration and is not evidence of current provider integration. The actual localhost HTTP results above cover the current local backend.

`npm audit --omit=dev` still reports eight advisories: three high findings in Prisma CLI/config/deepmerge configuration-merge dependencies, and five moderate findings in Expo CLI/fingerprint/glob/minimatch paths. These are present toolchain dependency findings and require supported follow-up; this is not an audit-clean claim. Do not force a breaking Prisma 7 upgrade that removes the required MongoDB connector or an incompatible Expo downgrade.

Real Android/iOS capture, GPS accuracy/permissions, playback, network interruptions, accessibility and device acceptance remain open. Local tests do not prove live payment/media/AI providers, escrow custody, refunds/payouts, store signing, or a production release. Financial/provider restrictions in historical plans remain constraints until explicit acceptance replaces them.
