# Memory — Rentral phone account flow verified

Last updated: 2026-11-09 (Africa/Lagos). Runtime verified; source ready for authorized commit/push.

## What was built

Expo SDK 58 Android/iOS app in apps/mobile, sharing the Next.js web/API services:
discovery/details/video, saves, bookings, chat, optional profiles and owner
camera/GPS/document submission. Existing web host actions/check-in/optional
checkout and web draft resume remain web flows.

KYC onboarding/initiation/profile-completion access gates are removed. Historical
verification stays factual; authentication, ownership, participant/staff,
publication and payment controls remain. MongoDB via Prisma 6.19.3 preserves
transaction revision locks, overlap prevention, exact balanced integer-kobo
ledgers, immutable audits/hold allocations, private GPS and thresholded Insights.
Local filesystem uploads and purpose-bound signed Range/HEAD files replace
Supabase Storage. JWT accounts replace Supabase/OAuth.

## Decisions made

Use npm 11.19.1 workspaces, Node 24.x, Expo SDK 58, Next.js 16.4.5 and Prisma
6.19.3 MongoDB. App/backend run locally. The user's later explicit choice is
KEEP THE SAVED ATLAS CONNECTION. Preserve private environment settings; do not
replace the database, restore Supabase/pnpm/KYC, import legacy data or run old SQL.

User-authorized Atlas preparation checked/prepared 29 collections and 73 indexes,
validators and readiness marker. No reset/import; original PostgreSQL/Supabase
remains untouched. Normal integration suites use only owned disposable local
fixtures. The controlled Atlas diagnostic ran within the authorized account-flow
repair and removed only its temporary records. No real addresses, database URI
or credentials belong in tracked files.

Passwords use salted scrypt-v1 (N=32768/r=8/p=3). Access lasts 15 minutes; refresh
capabilities rotate once within a 30-day session and are stored as hashes. Current
AuthSession and database staff_role are authoritative. Private development reset
codes are opt-in; production email recovery is unavailable. Supporting asset
documents are listing review, not personal KYC.

Source commit/push to Uncleiked/rentral-mobile is authorized. Git history and the
coordinator's final response identify the delivered revision; do not add a
self-referential commit hash here. No deployment/store build/provider activation.

## Problems solved

Metro was serving the phone bundle without an API backend. Keep both processes:
root npm run dev binds fixed API port 3000; npm run mobile serves Expo on 8081.
The ignored mobile API origin is explicitly set to the reachable computer LAN.
Missing/loopback/tunnel native hosts now require actionable explicit configuration;
emulator addresses are not guessed, and Expo tunnels do not forward the API.

The saved Atlas IP entry had drifted. After a user-approved public-IP check the
user updated the /32. TLS, replica-set checks, preparation and Prisma reads pass.
The external approval covered an IP-only lookup; no private Atlas hostname was
sent to a third-party DNS service.
Failed readiness clients are evicted instead of caching a closed topology;
readiness auth errors are safely mapped/redacted.

A session transaction exceeded the prior five-second timeout after account
creation. Acquisition/execution now allow up to 5s/10s within 15s total; P2028 is
never replayed. Registration after a fresh backend restart returned 201 in 12.4s,
under the native 20s timeout. Concurrent phone background traffic was present;
do not describe this as an isolated cold-only startup benchmark.

Earlier safeguards remain: session creation rechecks the verified hash under the
user lock; password resets revoke sessions/other reset codes; strict refresh CAS;
bounded pending cookie refresh; explicit bearer precedence; logout can revoke by
refresh capability. Oluso is opt-in and does not block unconfigured startup.
Fresh production builds may need network access for the Google Inter font.

## Current state

Actual phone sign-in returned 200 (6.4s); profile/listings returned 200; profile
PATCH returned 200 (6.6s). Subsequent messages, bookings, saves and category/location
discovery all returned 200. Live member use confirms the account-flow failure is
resolved. The original real account is preserved.

The controlled Atlas registration/profile/listings/sign-in diagnostic succeeded.
Guarded cleanup removed only its User and two sessions; diagnostic accounts
remaining: zero. No general data cleanup or reset ran.

Latest full npm tests: 636 across 61 files PASS. Owned local Mongo fixture 16/16
PASS after the timeout change; foundation checks 11 PASS; root/mobile typechecks
and lint PASS. The Android dev bundle (~6.4 MB) contains the verified origin and
diagnostics. Earlier delivery separately passed 34 local HTTP checks, Expo Doctor
20/20, platform exports/private-value artifact scan and production build. Those
earlier checks are scoped separately from the live phone evidence.

Owned Next reference 94501 and Expo reference 39088 are intentionally left running
at the coordinator's latest check (API 3000, Metro 8081). They are volatile tool/
process references, not proof of current identity or liveness. Revalidate actual
listeners, commands and ownership before reuse or stopping anything.

Last recorded npm audit --omit=dev: eight toolchain findings (three high Prisma
CLI/config/deepmerge; five moderate Expo CLI/fingerprint/glob/minimatch). Track
supported updates without a breaking Prisma 7/Expo change; no audit-clean or
production-readiness claim.

## Next session starts with

1. Read README, current architecture/progress and context/local-development.md.
   Preserve the chosen Atlas connection and private phone API configuration.
2. Revalidate the intentionally running services and check Git state for delivery.
3. Continue real Android/iOS camera/GPS/permissions/playback, refresh/logout,
   network/accessibility and provider acceptance; phone account use is verified.
4. Keep automated tests isolated and preserve the original real account/data.

## Open questions

Real capture/device coverage beyond the verified member account flow, production
recovery mail, provider custody/refund/payout/default-compensation and operational
release acceptance remain. No legacy-data import is authorized.
