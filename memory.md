# Memory — Profile Real-Data Wiring & PostHog Telemetry

Last updated: 2026-07-20

## What was built

### Dev environment fixes (unrelated bugs surfaced along the way)

- Fixed corrupted Next.js auto-generated `.next/dev/types/validator.ts` (TS1109 errors) — cleared `.next`, restarted. Not a source bug.
- Fixed `next/image` "unconfigured host" error for Supabase avatar URLs — added `rabnthzbbkskdihvjpwc.supabase.co` (scoped to `/storage/v1/object/public/**`) to `next.config.ts` `images.remotePatterns`.

### Profile real-data wiring

- Added `TrustSummary` type + `getTrustSummary()` in `lib/profile-data.ts`. Real zero counts for fields with no backing system yet (ghost listings, listings count, followers, handshakes, rentals, on-time payments — all legitimately 0, same as any new account). Real `verifiedSinceYear` from `User.createdAt`. `null` → "—"/"Coming soon" placeholder for trust score, avg response time, show-up rate, top-percent rank (no reputation/messaging/handshake systems exist yet — never fabricate these). Updated `TrustStatsBar`, `TrustLedgerSummary`, `OwnerProfileHeader`, `VisitorProfileHeader`, `ReviewsSummary` to consume it. Removed dead `getMockTrustProfile`/`MockTrustProfile`.
- Added `getListingsForProfile()` in `lib/profile-data.ts` — returns `[]` (no `Listing` model exists yet; build-plan.md Phase 1 items 06–11 unbuilt). `ListingsGrid` now renders a real "No listings yet" empty state instead of 6 fake Unsplash listings. Removed dead `MockListing`/`MOCK_LISTINGS`.
- Left `progress-tracker.md` item 28 unchecked — owner dashboard (`EscrowWalletCard`, `ActiveLeaseCard`, `CreditTrustCard`, `InspectionsHandshakesCard`, `SavedSearchesCard`, `SecurityCard`) is still fully mock; none of their backing models exist.

### PostHog telemetry (progress-tracker item 05 → `[x]`)

- `lib/posthog.ts` — singleton `posthog-node` client (`flushAt: 1`), `captureServerEvent()` helper: flushes per call, swallows/logs errors so analytics can never break a user-facing flow.
- 6 real events wired, each verified against actual function bodies first (not the wizard's stale plan): `user_signed_in`/`user_signed_up` (`app/(auth)/sign-in/actions.ts`), `verification_started` (`app/onboarding/actions.ts` → `initiateVerification`), `verification_completed` (`app/api/webhooks/didit/route.ts`, fires on every Didit status transition, tagged `status`), `onboarding_completed` (`app/actions/profile.ts` → `submitProfile`), `profile_updated` (`app/actions/profile-edit.ts` → `updateProfileIdentity`/`updateAvatarUrl`, tagged `field: 'identity'|'avatar'`).
- Client-side init (`instrumentation-client.ts`, `posthog-js`) was already wizard-generated; left as-is.
- Removed stale `posthog-setup-report.md` after fixes made it inaccurate.
- Ran the project's `/review` skill against this work (see Open questions — 2 Important + 4 Minor issues found, all doc-vs-implementation gaps, not bugs; reported to developer, not yet resolved).

## Decisions made

- `.agents/skills/` (`remember`, `review`, `architect`, `imprint`, `recover`, plus Tailwind/Supabase reference skills) are project-local skills **not** registered with the Skill tool — must be read directly via the Read tool and followed manually, never invoked via `Skill()`.
- For profile stats with no backing system, established the pattern: real zero where the concept is genuinely empty (counts), `null`/placeholder where it requires an actual computed formula (scores, rates, rankings) — never fabricate either.
- PostHog server client: chose a persistent module-level singleton + `flush()` per call over `library-docs.md`'s documented per-call factory + `shutdown()` pattern. Reasoning: `shutdown()` permanently closes a client, so applying it to a reused singleton would break every subsequent call. Flagged explicitly to developer in the review rather than silently deciding it was right — awaiting their call.
- Used `npx` instead of `pnpm dlx` specifically for the one-off PostHog wizard CLI launch (pnpm's strict `node_modules` broke `@inkjs/ui`'s `react` resolution). Confirmed this doesn't violate the project's "always use pnpm" rule — the wizard's own internal agent uses `pnpm add`/`pnpm typecheck` for all actual project changes; `npx` here only launches the throwaway tool.

## Problems solved

- PostHog wizard `Unsupported engine` — required Node ≥22.22.0, had v22.12.0. Fixed via `nvm install 22.23.1 && nvm alias default 22.23.1`.
- `pnpm: command not found` after the Node switch — nvm keeps separate global `node_modules` per Node version. Fixed with `npm install -g pnpm`.
- `pnpm dlx @posthog/wizard` → `ERR_MODULE_NOT_FOUND: react` — pnpm's strict/symlinked `node_modules` doesn't hoist `react` into `@inkjs/ui`'s own `node_modules`. Switched to `npx` for this one command only.
- `ERR_PNPM_UNEXPECTED_STORE` / `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` — the freshly installed global pnpm was a newer major version (11.x) than what built the existing `node_modules` (v10 store). Fixed with `CI=true pnpm install` (lockfile-driven relink, no version changes).
- `ERR_PNPM_IGNORED_BUILDS` blocking every pnpm command — `pnpm-workspace.yaml` had an unresolved `core-js: set this to true or false` placeholder. Verified `core-js`'s postinstall is a harmless no-op, set to `false`.
- Post-reinstall `Module '"@prisma/client"' has no exported member` errors — Prisma client wasn't regenerated after the fresh install. Fixed with `pnpm exec prisma generate`.
- `posthog-js`/`posthog-node` were referenced in wizard-generated files but never actually in `package.json` — the wizard silently failed mid-run on the pnpm store issue above. Installed both explicitly.

## Current state

- Dev server running clean on `http://localhost:3000`. Node v22.23.1 is now the nvm default (was v22.12.0).
- `tsc --noEmit` and `eslint` clean across all touched files.
- `progress-tracker.md`: items 01–05 marked `[x]`. Next roadmap item: 06 Mobile-First Capture UI.
- PostHog events are live and functional, but the `/review` skill found 2 Important + 4 Minor issues — all documentation-vs-implementation gaps (`code-standards.md`'s PostHog event-name list is 100% Phase 2+ concepts with no Phase 1 coverage; `lib/posthog.ts`'s singleton+flush pattern vs. the docs' per-call factory+shutdown pattern; minor file/env-var naming mismatches vs. `architecture.md`/`library-docs.md`). None fixed yet — awaiting developer decision on whether to conform code to the docs or update the docs to reflect Phase 1 reality.

## Next session starts with

- Get developer's decision on the review findings, then either apply fixes or extend `code-standards.md`/`library-docs.md`/`architecture.md`'s PostHog sections with a Phase 1 events addendum covering the 6 events actually shipped.
- After that: roadmap item 06, Mobile-First Capture UI (WebRTC camera + HTML5 Geolocation) — the first step toward giving listings (and richer trust stats) something real to show.

## Open questions

- Should `code-standards.md`'s "PostHog Telemetry Events" list be extended with the 6 Phase 1 events actually implemented, or left as pure future-state documentation?
- Should `lib/posthog.ts` switch to the documented per-call factory + `shutdown()` pattern, or should the docs be updated to reflect the singleton + `flush()` approach?
- Unverified: whether `instrumentation-client.ts`'s `defaults: '2026-05-30'` bundle auto-captures pageviews, which would contradict `library-docs.md`'s explicit `capture_pageview: false` + manual-trigger instruction. Wizard-generated file, not yet audited.
