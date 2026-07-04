# Memory — Onboarding Pipeline Bug Fixes

Last updated: 2026-07-04 00:42

## What was built

- Fixed all 3 onboarding pipeline bugs across 6 files:
  - `lib/proxy.ts` — replaced stale `/auth/login` → `/sign-in`, removed unsafe `user_metadata` fallback (Supabase security best practice)
  - `app/auth/callback/route.ts` — replaced `/auth/login` → `/sign-in`, added `profile_completed` to completeness check
  - `app/(auth)/sign-in/actions.ts` — replaced `/auth/login` → `/sign-in`, added `profile_completed` to `onboardingComplete()`
  - `app/onboarding/actions.ts` — added KYC guard to `initiateVerification` (prevents re-verification state wipe), included `profile_completed` in all `syncUserAppMetadata` calls, queries now include profile relations
  - `app/api/webhooks/didit/route.ts` — added `profileCompleted` to `syncAppMetadata` function signature and all calls, queries include profile relations
  - `app/actions/profile.ts` — full metadata sync when setting `profile_completed: true` (includes all existing fields, not just the one key)

## Decisions made

- `user_metadata` removed from proxy claims fallback — per Supabase skill, it's user-editable and unsafe for authorization decisions. Strictly `app_metadata` only.
- Server-side guard on `initiateVerification` — the action rejects re-verification even if the UI renders the button. Security boundary lives at the server, not the UI.
- `profile_completed` is now part of every completeness check and every metadata sync across the entire codebase — proxy, callback, sign-in actions, onboarding actions, webhook, and profile submission.

## Problems solved

- **404 on login:** All `/auth/login` references replaced with `/sign-in` — the actual sign-in page route.
- **Onboarding always resetting:** `onboardingComplete` checks in callback and sign-in actions now require `profile_completed === true`. Users with KYC + username but no profile are correctly routed to the ProfileForm step instead of `/marketplace` (which proxy would bounce back to `/onboarding`).
- **Re-verification state wipe:** `initiateVerification` now checks `dbUser.kyc_verified` first and rejects if already verified. No more accidental state reset.
- **Metadata sync inconsistency:** Every metadata sync now includes `profile_completed`, computed from actual Prisma profile relations. No more sparse updates that could leave metadata incomplete.

## Current state

- Build passes cleanly (`pnpm build` — no TypeScript errors)
- All onboarding flows should now work correctly:
  - New users: account type → KYC → profile form → username → marketplace
  - Existing users (KYC + username, no profile): should land directly on ProfileForm
  - Fully completed users: should go straight to `/marketplace`
- Progress tracker updated: Phases 01–04 marked complete

## Next session starts with

- Test the fix manually: sign in with the existing account (KYC verified + username set) and confirm the ProfileForm renders instead of the account-type step.
- After profile submission, confirm redirect to `/marketplace` works end-to-end.
- Then proceed to Phase 1 item 05: Telemetry & PostHog Initialization.

## Open questions

- None remaining from this fix. All architectural decisions are resolved.
