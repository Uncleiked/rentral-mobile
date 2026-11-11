# Memory - Google activation diagnosis in RentralMobile

Last updated: 2026-11-11 Africa/Lagos.

## Active project and constraints

Work in C:/Users/Mudian Consult/Documents/RentralMobile, not the default rentral
workspace. User explicitly selected this project: npm (use npm.cmd in PowerShell),
MongoDB/Prisma6.19.3 and JWT email/password plus optional Google web sign-in.
Keep hosted databases and private environment settings unchanged. Do not apply
setup, reset data, publish or send user notifications as part of this diagnosis.

## Latest problem and findings

User says Google still does not work after setup. Screenshots show the Google
button disabled with awaiting-configuration, before any OAuth navigation. Vercel
has GOOGLE_AUTH_ENABLED, GOOGLE_CLIENT_ID/SECRET and NEXT_PUBLIC_APP_URL; the
older NEXT_APP_URL is unused. User explicitly confirmed a new Ready Production
deployment after adding the correct origin. Do not conclude they skipped redeploy.

Read-only checks: local /sign-in returns Google available; production
https://rentral.vercel.app/sign-in returns Google awaiting configuration (HTTP200,
cacheMISS). Local npm.cmd run env:check passes. This checks availability only;
no full real Google-account login/token exchange was tested or account created.
Private Vercel settings/logs are not connected/accessible here.

## Saved implementation

New lib/auth/google-settings.ts provides pure shared runtime/offline validation.
lib/auth/google-config.ts keeps the prior runtime checks and requires the exact
GOOGLE_AUTH_ENABLED=true flag. scripts/check-environment.mjs now uses the same
validator; previously it accepted malformed client IDs and secrets rejected at
runtime. lib/auth-providers.ts logs fixed reasons only at [auth/google/readiness]:
GOOGLE_AUTH_NOT_ENABLED, GOOGLE_CLIENT_ID_INVALID, GOOGLE_CLIENT_SECRET_INVALID,
NEXT_PUBLIC_APP_URL_INVALID, GOOGLE_DATABASE_SETUP_REQUIRED, DATABASE_SETUP_REQUIRED,
DATABASE_UNAVAILABLE or GOOGLE_DATABASE_CHECK_FAILED. It logs no raw exception,
setting value, URI, identity or provider payload. Public UI stays generic and all
database/OAuth security gates remain. No public diagnostic endpoint was added.

Added tests/google-provider-readiness.test.ts for config short-circuit/noDB,
storage gates, sanitized errors and offline/runtime parity. Updated guide,
progress tracker and UI registry. Source is saved locally, not committed/pushed.
Before this follow-up HEAD was86049d9 and the tree was clean.

## Verification

84focused tests across7files pass, TypeScript/scopedlint/localenvcheck pass,
npm.cmd run build passes (108static pages). Independent read-only review found no
blocking issue. No hosted writes, env changes, Vercel config edits or deployment ran.

## Earlier repairs to retain

Commit86049d9 fixed Next internal0.0.0.0 callback origin handling with strict
configured Host checks; valid local cancelled OAuth now returns google=cancelled.
Callback logs stage only. Tests/flow enforce encrypted cookies, state, nonce, PKCE
and signed Google ID tokens. Matching local email never auto-links accounts;
existing password confirmation is required and credential changes invalidate binding.
Read-only local DB check in the previous follow-up found googleAuthVersion1 and
organizationVersion1. It does not prove production uses the same DB.

Windows build scripts reuse a verified Prisma generated-client hash snapshot,
avoiding EPERM DLL copies with active Next dev. Missing/stale inputs still require
normal generation; no engine disabling, DLL deletion or forced process termination.
Canonical admin is /admin. Earlier admin/gallery/organization features are in the
source and dedicated context guides.

## Next session starts with

User must deploy the new diagnostic source, refresh production /sign-in, then
inspect Vercel -> Rentral -> Logs for [auth/google/readiness] in that deployment.
Request only the sanitized reasons line, never credentials or callback parameters.
context/google-sign-in-setup.md has exact instructions and reason-specific actions.
Use that evidence to resolve the production failure. No confirmed root cause yet;
do not bypass readiness or automatically prepare a hosted database.
