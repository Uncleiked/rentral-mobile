# Memory — KYC Auth Check & Middleware Fix

Last updated: 2026-06-27

## What was built

- Transitioned the app from the deprecated Next.js `middleware.ts` convention to the new `proxy.ts` standard for Edge route interception.
- Renamed the internal helper `lib/middleware.ts` to `lib/proxy.ts` and created a root `proxy.ts` that properly intercepts and proxies requests.
- Secured the `/marketplace` route by enforcing the `kyc_verified` claim check on all incoming requests.

## Decisions made

- Fully adopted the `proxy.ts` convention mandated by Next.js 16.2.7+ instead of attempting workarounds, ensuring clean builds without warnings.

## Problems solved

- Fixed a critical vulnerability where un-KYC'd users could access `/marketplace` because the old middleware file was misplaced (in `/lib`) and using an invalid Supabase SDK method.
- Replaced the failing `supabase.auth.getClaims()` call with the correct `await supabase.auth.getUser()` to safely read identity and `app_metadata` during Edge execution.

## Current state

- The Edge runtime authentication check is fully active. Unverified users are now securely redirected to `/onboarding` before they can view the marketplace. 
- The project successfully compiles with `next build`.

## Next session starts with

- Building out the next requested feature, testing the complete Didit KYC verification flow, or hooking up dynamic data fetching for the marketplace feed.

## Open questions

- Now that the `/marketplace` route is locked down, do we need to implement any specific bypass routes for admin testing, or do all admins also go through Didit KYC?
