# Memory - Windows-safe build and active RentralMobile

Last updated: 2026-11-11 Africa/Lagos.

## Latest follow-up: Google callback origin and production flag

User reported the same Google error locally and on https://rentral.vercel.app,
and asked what key belongs in GOOGLE_AUTH_ENABLED. That setting is exactly true,
not a generated secret; existing Vercel Secret type can remain. Actual credentials
are GOOGLE_CLIENT_ID/SECRET from Google Auth Platform Web application client.
The production NEXT_PUBLIC_APP_URL must be https://rentral.vercel.app and registered
callback https://rentral.vercel.app/auth/google/callback; local remains localhost3000.
Saving env values requires a new deployment, and this local source fix must be
committed/pushed/deployed by the user to affect production. No publish ran.

Local private configuration now has Google flagtrue, valid-shapedClientID and a
secret, with localapporigin. Read-only Mongo check found googleAuthVersion1 and
organizationVersion1 already present (prepared outside this agent follow-up).
No env/DB changes by agent. Public Google JWKS returned200 and validRSAkeyshapes.
Production's public sign-in was observed with Google disabled; private Vercel
settings cannot be inferred from that alone and no service connector is available.

Reproduced callback failure without any Google login: isolated browser start,
blockedaccounts.google.com navigation, validencryptedflow/state/nonce/verifier and
configuredorigin, then error=access_denied callback incorrectly returned failed.
InstalledNext16builds request.url frominternal0.0.0.0bindaddress. Fixed using new
lib/auth/google-origin.ts exactconfiguredHost resolver; ignoresarbitraryforwarded
hosts and only permitsinternalHTTP-toHTTPS withVercelserverflag+HTTPSforwardmarker.
State/nonce/PKCE/tokenchecks remain. Actual local cancellation nowreturns cancelled.
Callbacklogs fixed stage only (configuration/callback/state/exchange/account),
never error messages, codes, cookies, provider bodies or identities.

Changedcallbackroute, addedgoogle-originhelper/tests, expandedcallbackregressions;
41focused tests across5files PASS, typecheck/scopedlintPASS afterexplicittyped
headerfixturecorrection. Final production build PASS (108pages) after the typed test-table correction.
Full live Google account/token exchange not performed; source/API fixture tests
and a real cancellation do not prove a successful real-user login. Currentdevserver
was left running and no hosted database, Vercel config or OAuth setting was changed.
Updated context/google-sign-in-setup.md with exactproduction origin/callback/env/
redeploymentsteps and officialGoogle/Verceldocs. Source savedlocallyuncommitted.

## Latest follow-up: Windows build fixed

The user reported npm build failing. Reproduced npm.cmd run build exit1 with
EPERM renaming query_engine-windows.dll.node while Next PID34928 held it open.
Read-only installed Prisma6.19.3 source confirmed unconditional engine overwrite.
Changed package.json build to node scripts/build.mjs and added
scripts/prisma-build-cache.mjs plus its .d.mts declaration. The hash-only ignored
node_modules/.cache/rentral/prisma-build.json proof is written only after normal
generation exits0. Exact schema/config/tool-package/generation-flag/Node/platform
inputs and every non-temp generated artifact must match before reuse. Missing,
changed or partially generated clients still run standard Prisma generation.
Native engines were not disabled or removed; no processes are killed by the script.

Stopped only confirmed old Next PIDs1380/34928 once for generation. First corrected
full build passed and recorded its proof. A Next dev instance was already running
again when restoration was attempted; reused it rather than killing it. Verified
listener24564/parent19148 in this exact project, /sign-in200 and tasklist reporting
the same process holding query_engine-windows.dll.node. Final npm.cmd run build
passed with that active lock through verified client reuse, TypeScript and108page
generation. A missing .mjs declaration caught during verification was corrected;
final npm.cmd run typecheck and scoped ESLint passed.12new cache regressions pass.
The previous full1953app tests/88browser results below are historical, not rerun for
this build-only increment. No application UI/API/runtime behavior changed.

README/library-docs/progress explain that ordinary unchanged-client builds may run
with dev. After schema/tool changes or a fresh unverified install, stop this
checkout's dev/start terminal with Ctrl+C before generation on Windows. Use
npm.cmd run build (not npm build); npm run build also works when the shell allows
npm.ps1. No DB preparation, .env changes, dependency installation, commit/push or
deployment ran. All prior current feature gates/setup limitations remain.

## Active project and authority

The user explicitly confirmed C:/Users/Mudian Consult/Documents/RentralMobile,
http://localhost:3000/admin. The current Codex workspace may still be the separate
Documents/rentral folder: do not edit that old Supabase app for this task. Use
RentralMobile (ordinary spelling without invisible characters) as the working
directory and read its AGENTS/context/current installed Next docs first.

Latest sign-in instruction: KEEP email/password with MongoDB/JWT AND add Google
as an alternative. Google-only is superseded. npm11.19.1/Node24, Prisma6.19.3,
Next16.4.5/React19.3, private local storage and existing native compatibility stay.
Personal KYC remains removed. Supabase/PostgreSQL/Clerk are not used by this app.

Preserve .env.local, existing Atlas accounts/data/roles/uploads and old PostgreSQL.
No hosted schema/preparation, user permission, provider configuration or private
environment changes were made. Do not repeat owner bootstrap or enable gallery
by a database tool. New Google/organization preparation remains unapplied. No
commit/push/deployment ran; all changes are saved in the working tree.

## Changes

- Actual /admin: six keyboard-accessible tabs, focused queue/detail review, search,
  listing status filter and compact switch. Current permissions determine actions.
  Native gallery switch shows saved versus pending state; Record decision needs
  a reason and explicit owner-self override with30characters (other decisions15).
  Original commands/receipts survive uncertain outcomes and exact retries; stale
  selection refreshes safely. Mobile search width fixed after visual inspection.
- Gallery grant/revoke notifies once atomically with audit/receipt; postcommit cache
  refresh cannot turn success into uncertainty. Existing authorization, revision,
  human-document review, grant revocation and truthful gallery labels remain.
- Direct Google OAuth: state/nonce/PKCE, bounded fixed HTTPS provider endpoints,
  verified issuer/audience/authorized party/email, encrypted HttpOnly cookies.
  Matching email alone never links: current Rentral password must confirm.
  GoogleIdentity subject/user binding is immutable; credential/email fingerprint
  changes force password reconfirmation. Session creation rereads current User and
  binding under the User lock. Existing owner role/gallery flags never come from
  Google metadata. Google is web-only; existing native password login remains.
- New web signup requires Individual/Organization and terms. Existing native
  registration remains backward-compatible with default individual. Organization
  admission has private CAC certificate OR status report, optional authority/
  licence/address support, revisions/status/reasons, exact digest-bound evidence,
  independent staff checklists and actor-scoped receipt/readback recovery.
- Current DB account type/approval gates proxy, actions and APIs. Narrow session
  exceptions cover organization enrollment, account tools, assigned staff/redress.
  Null legacy account types remain individuals. Unknown nonnull type cannot loop
  through onboarding. Refresh cookies survive organization-readiness503 after
  rotation. Current/historical organization evidence remains protected by claims.
- Added GoogleIdentity and OrganizationApplication model/index/validator plans,
  googleAuthVersion and organizationVersion readiness, separately gated so old
  individual sign-in/admin do not need new preparation. No selected Atlas setup ran.
- New guides: context/local-setup-audit.md, google-sign-in-setup.md and
  runtime-admin-auth-repair-plan.md; updated README/progress/both UI registries.
  Environment checker supports optional Google settings without revealing values.
  Playwright default now3000 (was incorrectly3100). No dependency install/change.

## Verification

- Final ordinary Vitest suite:1953 passed in149 files,107 owned real-fixture cases
  skipped. Focused counts overlap and must not be added to the aggregate.
- TypeScript and full lint PASS. Prisma validate/generate PASS. Final production
  build PASS after the representative-role input limit was aligned to100.
- Actual-app browser coverage:48 passed across320/390/768/1440;4 disabled-Mux guard
  cases skipped because Mux is configured. Initial44 passed plus4 password-recovery
  cases passed after replacing old Supabase link expectations with actual reset
  code UI. The invalid code is malformed before any DB lookup/write. Artifacts:
  test-results/current-app-browser and current-app-recovery-browser.
- Admin actual-component/API-boundary fixture:40 passed(10journeys x4viewports),
  synthetic records only, external requests blocked, all4actual Inter weights
  loaded/asserted. Includes gallery grant/revoke, owner confirmation, stale state,
  lost receipt/exact retry, organization evidence/checklists and unavailable setup.
  Desktop/320screenshots visually inspected; serif fixture font and collapsed
  mobile search caught/corrected. Artifacts test-results/admin-workspace-browser.
- Independent auth/org review found no blocking source issue; minor form limit
  fixed. New source, docs and tests scanned against9actual private env values:
  1042files,zero matches. No private value was printed.
- New owned Mongo integration assertions were NOT executed. Docker Desktop app
  says running but engine status is stopped; info hangs. Do not run fixtures
  against Atlas as a workaround. Existing107fixture results fromNov10 are history.
- No live Google OAuth, organization applicant/staff/Storage acceptance, physical
  device, provider webhook/payment/email delivery or real gallery grant claimed.

## Environment and setup

Read-only audit confirmed MONGODB_URL/JWT_SECRET/NEXT_PUBLIC_APP_URL present;
configured origin matches localhost3000. Mongo ping and13previous readiness
markers passed. Mux GET returned200 and playback private key parses; Geoapify
sample returned200. This is not webhook/playback/address accuracy acceptance.

Google keys and flag are missing/off. Configure GOOGLE_AUTH_ENABLED=false,
GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET privately, register the exact redirect
http://localhost:3000/auth/google/callback in Google Auth Platform (direct app,
NOT Supabase), then deliberately prepare the reviewed additive chosen database.
For saved Atlas the manual command is npm.cmd run db:setup -- --allow-remote;
it changes that selected database and was NOT run. Set GOOGLE_AUTH_ENABLED=true
only after prep/config, restart, and test real new/existing linked Google accounts.
Organization admission needs its new readiness/collection but no API key or flag.

Paystack collection, real Resend email, lifecycle sending, encrypted backups and
optional push/commercial/analytics/settlement are unconfigured. AUTH_DEV_EMAIL_OUTBOX
is enabled: recovery codes are private local outbox files, not delivered email.
Mux/media worker and Geoapify are configured; worker flags do not start a process
or make localhost webhooks reachable. Follow the current audit/individual guides.

## Runtime and next work

Root stopped only confirmed RentralMobile Next PIDs8932/19336/26380 (both dev and
old production had used3000). This released Prisma's Windows DLL for generation.
The latest verified development backend is on3000, listenerPID24564/parent19148. Earlier toolsession61262/PID34928 was stopped for the build repair. It serves updated source with hot reload. Keep exactly
one backend; other projects/Metro and oldrentral3100were not stopped. Production
build remains saved in.next; dev uses.next/dev.

Next work: user completes Google/config/additive prep in chosen environment;
run the owned Mongo fixtures when Docker engine works, then live Google and real
organization/gallery/provider/device acceptance. Preserve active sessions, history
and private files. Recheck actual current processes and Git before new work.
