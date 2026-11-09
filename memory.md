# Memory — Rentral local Expo, MongoDB and JWT migration

Last updated: 2026-11-09 (Africa/Lagos); final source validation passed and commit/push authorized.

## What was built

Expo Android/iOS client in apps/mobile: Explore/search/filtering, signed listing video/details, saves, bookings/history, inbox/chat, optional account edits and owner camera/GPS/document listing submission. Native cards open web for existing host status actions/checkout/check-in; existing web drafts resume on web.

Removed all KYC onboarding/forms/initiation and profile-completion access gates across web/API/domain services. Historical verification evidence remains truthful; no account is marked verified as a bypass. Authentication, ownership, participants, staff and publication/payment checks remain.

Migrated active persistence to Prisma 6.19.3 MongoDB with reviewed indexes/validators/readiness marker. Shared service changes preserve actual transaction locking, rental/hold overlap exclusion, integer-kobo balanced ledger, immutable audits/allocations, one-use paid hold credit, monthly privacy cohorts and private ListingLocation GPS.

Added local JWT email/password accounts and private session records, development reset-code recovery, current database staff roles, refresh rotation, cookie/native adapters and race protections. Added local filesystem uploads and purpose-bound signed private Range/HEAD downloads with byte/MIME/magic/path/link validation and immutable object paths.

Current READMEs and context/expo-implementation.md / mobile-api.md document local setup/contracts. Earlier README is archived at context/legacy-web-readme.md. Top current notes in overview/architecture/standards/library/build-plan/progress explicitly supersede old stack guidance.

## Decisions made

User authority: npm 11.19.1 workspaces, Node 24.x, Expo SDK 58, MongoDB and user information, JWT auth, local uploads, everything local. Do not restore pnpm, Supabase/OAuth/KYC or PostgreSQL assumptions from old context. Prisma 6.19.3 remains pinned because Prisma 7 is not an accepted Mongo connector path.

Use npm install; npm run setup:local; start compose.mongodb.yml replica set; npm run db:setup; npm run dev; npm run mobile separately. Setup fills missing/empty local settings and preserves existing nonempty values. Existing ignored MONGODB_URL was preserved; no URI/key is recorded here. JWT secret is backend-only. Mobile only needs optional EXPO_PUBLIC_API_URL; development normally discovers the Expo computer.

Mongo requires a replica set. Setup is local by default; remote setup requires separate explicit manual authorization/override. Never use prisma db push, replay historical SQL, import legacy data, or reset the application's database. No hosted changes or old-data import occurred.

Passwords: scrypt-v1, N=32768/r=8/p=3, random salts. Access tokens last 15 minutes; one-use refresh credentials rotate within a 30-day session and are stored only as hashes. Every access checks a live non-revoked AuthSession and current staff_role. Development recovery requires AUTH_DEV_EMAIL_OUTBOX=true and writes only private RENTRAL_STORAGE_DIR/mail-outbox; production delivery is unavailable.

Financial/provider constraints remain. No escrow/custody/refund/payout/default-compensation guarantee, live provider activation, deployment or store build/submission. Supporting asset documents are listing review, not personal KYC. The user explicitly authorized committing/pushing the completed source to https://github.com/Uncleiked/rentral-mobile.git; verify Git history/remote and the final delivery response for its outcome.

## Problems solved

Mongo transaction locking must write revision fields; unchanged updates/read locks do not serialize. Bounded conflict retries were expanded after real concurrent fixture evidence. Nullable unique indexes and readiness marker are prepared explicitly; missing setup fails closed before runtime Prisma operations.

Private GPS moved out of default Listing projections. Haversine checks replace PostGIS SQL and do not claim spheroid equivalence. Mongo optional null/missing media CAS conditions handle both representations.

Old-password login cannot create a new session after password reset: session creation locks/rechecks the verified hash snapshot. Password changes revoke all old sessions and outstanding reset codes. Direct refresh uses strict CAS; web cookie calls share only bounded pending hashed-key work. Losing refresh responses preserve winning cookies; missing access cookies can refresh. Explicit bearer failures never use cookies. Outages remain 503 rather than successful signed-out responses.

Expo TS app.config helper resolution and initial '/' route were repaired earlier. Local JWT now removes PKCE/OAuth callback requirements. Native iOS footage remains real MOV/QuickTime, never a renamed MP4. Actual files/permissions still require phone testing.

Oluso's unconditional startup dependency was repaired: monitoring is optional
and requires both OLUSO_ENABLED=true and OLUSO_API_KEY. Missing monitoring setup
must not stop the local app.

The restricted production build could not fetch its configured Google Inter font.
An allowed-network retry passed without a source workaround; fresh web builds
need that font download unless already cached.

## Current state

Source delivery is authorized to Uncleiked/rentral-mobile; the coordinating agent handles commit/push. No deployment or store submission is part of this task. npm/Next 16.4.5 security update installed. Persistent local Mongo compose source exists; no persistent dev container was started automatically.

Final checks: npm test 583/58 files passed; 16 ordinary-run fixture tests skipped and separately 16/16 real Mongo passed. Root lint clean. Mobile strict typecheck/Expo compatibility/Doctor 20/20 and Android+iOS Hermes (~3 MB each)/web exports passed. Scan of 85 exported artifacts found zero actual private JWT/Mongo/database values.

Actual Next.js+Mongo localhost HTTP 34 checks passed: JWT/no-KYC/profile, upload/GPS, discovery/signed MOV 206/HEAD, saves/chat/booking isolation, browser cookies/proxy refresh, CSRF/bearer precedence, outbox 404/reset/logout. All test processes/containers were cleaned and generated Next files restored. Ignored report: test-results/localhost-d6caf8d21aa8/report.json. Production build passed with Next.js 16.4.5, strict TypeScript and 48 generated static pages. Earlier mocked Supabase transport smoke is historical.

npm audit --omit=dev reports 8 toolchain dependency findings (3 high Prisma CLI/config/deepmerge; 5 moderate Expo CLI/fingerprint/glob/minimatch). No audit-clean or production-readiness claim. Keep supported Prisma 6 Mongo/Expo versions while tracking safe updates; do not force breaking upgrades/downgrades.

Tests must use only uniquely owned disposable local Mongo/storage fixtures with strict URI/owner/marker checks, process-only test env and label-verified cleanup. Never point automated tests at configured application data. Old PostgreSQL harness/migrations are historical.

## Next session starts with

1. Read current README, architecture/current notes, progress tracker and this handoff. Verify final checks/fixture cleanup recorded by the coordinating agent; run npm scripts against source, not historical commands.
2. For local use, start the supplied replica set and run db:setup explicitly. Check configured endpoint choice without printing credentials; setup preserves any prior nonempty URI. Do not silently replace user settings.
3. Test physical Android and iOS login/reset, camera/GPS/permissions, capture/upload/playback, LAN access, refresh/logout and network-interruption behavior. Use compatible Expo Go or an owner-controlled local development build.
4. Keep optional providers disabled until separate accepted configuration/tests. Publication and real payments may remain unavailable without them. Complete provider/operational/security acceptance before considering any release.

## Open questions

Physical-device acceptance and final production/provider operations remain incomplete. Production recovery email delivery is not configured. No legacy data import strategy has been authorized. Git history/remote and the coordinating agent's final response record the authorized source commit/push outcome.
