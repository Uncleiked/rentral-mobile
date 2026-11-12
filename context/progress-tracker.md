## Progress Tracker

## Admin publishing and draft workflow extension - 2026-11-12

Implemented independent administrator grants for gallery uploads, free posting and
trusted direct publishing. Each has current role checks, audited reasons, revision
control and original-command receipts. Defaults remain unprivileged; account
suspension clears grants. Revoking direct publication returns eligible live/pending
direct inventory to manual review without restoring suspended/archived records.

Admin listing search now spans submitted records server-side by username (including
@handle), email, title, address or ID; filters/category/source/fee/archive/sort,
25-row cursor pages, member-to-listings navigation and scoped CSV exports added.
Exports cap at1,000 with explicit truncation and omit private identity/docs/GPS/bank
fields. Private immutable photo/video previews have60-second signed links. Current
manual publication still requires exact human document approval. Review queues
exclude trusted submissions waiting on fees/media; All submitted still shows them.
Recent dashboard metrics explicitly describe their50-record sample.

All admitted users can save incomplete private drafts after selecting a category.
Creation/gallery pages expose top Save draft and Save and exit, clear save/dirty/
recovery feedback, and correct owner resume links. Your listings separates Drafts,
Submitted, Live, Needs attention and Archived with search/counts. Submission keeps
the same saved row and returns its actual status. Corrected custom titles, gallery
posters and saved gallery house drafts falsely appearing dirty (boat-only captain
metadata had survived local defaults but was removed by secure category recovery).

Trusted publishing bypasses human approval while retaining current admission,
authority-document/media bindings, capture/address evidence or explicit gallery
exemption, video readiness and exact real fee/waiver checks. No fake DocumentReview
or payment is created. Future free-posting grants stamp waivers only on new validated
submissions. Owner Finish publishing has current-grant/revision checks and receipt
recovery. Public detail labels distinguish permission-based publication.

Verification: npm lint and typecheck PASS; full isolated tests2,078PASS,113SKIP
across6opt-in integration files. Admin Chrome22workflows across4viewports verified
(87/88initialpass;1fixturehotreload interruption plus finalviewportcases8/8rerun).
Owner Chrome8workflows across4viewports32/32PASS, including partial save at all4
wizardstages, gallery save/reload state and directpublish lost-response readback.
Final production build verification is recorded in admin-workflow-review.md.

Docker daemon unavailable: owned Mongo integration assertions remain skipped,
including6newgrant/payment/media scenarios. No hosted DB/env/provider/setup/reset/
index/deployment changes. Local Prisma6.19.3 client regenerated; briefly stopped
only this repository's verified DLL-holding Next dev process, then restored
localhost:3000. Source and context are saved locally. See admin-publishing-workflow.md
for operations and test commands; deployment is separate.


## Website consistency and responsive pass - 2026-11-12

Corrected the conflicting global light component palette that caused the
organization screenshot's unreadable white background/black card text. Shared
aliases now use the canonical Rentral dark palette. Removed competing radii and
font self-reference; retained locally bundled Inter. Added shared branded
AccountPage/account-styles for entry, recovery, Google completion and organization
registration. Normalized page/workspace cards, fields, action sizing, wrapping,
focus states and outer gutters across the web platform.

Navigation stays complete below1280px through a compact keyboard-dismissable menu.
Listing/booking/finance/commerce/matching/privacy/profile/lease/admin/message
workspaces fit narrow screens; property metadata starts columns at640px. Profile
dialog supports focus containment/Escape/restore and viewport scrolling. Fixed
phone listing-to-message composer visibility, bounded feed feedback and filter
field layout. Authentication actions, permissions and data/provider configuration remain unchanged.

Verified:2,002 isolated tests PASS,107 skipped; production build/TypeScript PASS;
web lint clean. All40 admin browser scenarios verified (38initialpass,2desktop
load-timeouts passed separately with longer fixture startup allowance).
Actual Next homepage12browser cases PASS.60 synthetic component/viewport checks
PASS at320/390/768/1024/1440px; menu and profile keyboard/focus checks PASS.
See ui-consistency-review.md for scope, screenshots, fixture setup and limits.
Final320px filter/save/share feedback checks PASS; latest production rebuild and
scoped lint PASS after the final presentation adjustments.

Docker unavailable; no authenticated database-backed browser fixture or native
device acceptance claimed. No DB/env/dependency/deployment changes. Earlier
database connectivity guide/progress edits were preserved. UI source is saved
locally and must be deployed to update the public Vercel site.


## Production database connectivity diagnosis - 2026-11-12

User supplied [auth/google/readiness] DATABASE_UNAVAILABLE and reported both
Google and email/password login failing on production, with ~10s invocations.
This is a failed Mongo readiness read before password validation. A missing
preparation marker is a different error; no setup/reset is warranted.

The saved local Atlas SRV/TLS connection passed an actual read-only ping and
projected base/Google/organization setup lookup. It does not prove the deployed
Vercel connection is the same. Independent source review found no connection
reuse/cache defect explaining the production-only timeout. Atlas IP/network
access and production URI/user settings remain candidates, not proven causes.
Asked user which Atlas IP rule is Active; private Atlas/Vercel access is unavailable.

87 isolated shared authentication/JWT/readiness/Google-gate tests PASS.
Saved network/access and private production configuration steps in
google-sign-in-setup.md. No auth code, dependency, environment, hosted data, Atlas
rule or Vercel setting/deployment changed. Production recovery remains pending
the external configuration correction and a fresh verification.


## Google activation diagnostics and checker parity - 2026-11-11

User confirmed Production was redeployed after adding NEXT_PUBLIC_APP_URL, but
the public sign-in still returned awaiting-configuration. Read-only HTTP checks
found local Google available and production unavailable before provider navigation.
The exact private production failure remains unknown; do not assume a missed redeploy.

Added pure lib/auth/google-settings.ts shared by runtime and offline env:check.
The old offline checker accepted short/invalid client IDs and whitespace/oversized
secrets that runtime rejected. Kept runtime validation and fail-closed storage
gates; added fixed-code server warnings distinguishing config keys, base database
readiness, Google-specific preparation and database unavailability/unknown errors.
No raw errors, credentials, connection strings or identities are logged. Public UI
and OAuth state/nonce/PKCE/token protections are unchanged.

84 focused tests across7files, TypeScript, scoped lint, local offline environment
check and npm.cmd run build PASS (108static pages). Independent review found no
blocking issue. Added guide instructions to deploy this source and inspect
[auth/google/readiness] in Vercel runtime Logs. Full real-user Google sign-in and
production acceptance remain pending. No environment, database, Vercel settings,
commit, push or deployment changes were performed by this follow-up.


## Google callback origin repair - 2026-11-11

Reproduced the reported callback failure with a valid encrypted flow, matching
state/nonce/verifier and configured origin, while blocking provider navigation.
The real Next bind URL rejected the external Host. Added a scoped exact-public-Host
resolver; untrusted hosts/forwarded hosts and protocol downgrades remain denied.
Valid local cancellation now returns cancelled, not failed. Added failure-stage-only
logging and regressions for internal bind URLs, Vercel HTTPS forwarding, forged
hosts, retained OAuth checks and secret-free logging.41focused tests, TypeScript, scoped lint and the final production build passed.
Production settings/instructions are in google-sign-in-setup.md. Production was
observed with Google disabled; no Vercel settings/deployment were changed.
The selected local environment now has Google fields/flag and both new readiness
markers; this was verified read-only, not applied by the agent. Full live Google
login and production acceptance remain pending user configuration/deployment.


## Windows build engine-lock repair - 2026-11-11

Reproduced npm run build failing EPERM while the active development server held
query_engine-windows.dll.node. Prisma6.19.3 copied that DLL unconditionally.
Replaced the raw build chain with scripts/build.mjs and a hash-only verified
snapshot in ignored node_modules cache. Missing/changed schema, config, tools,
generation flags or generated artifacts still require normal generation. Snapshots
are recorded only after generator exit0 and unchanged inputs; partial or incomplete
clients cannot be silently reused. Native engine generation stays enabled.

A first full generation/build passed with the lock released. Subsequent verification
kept the actual Next development server and its native engine loaded; reuse avoided
the original lock. Added12focused cache regressions and a typed declaration for
TypeScript consumers. Final npm.cmd run build passed with the active native-engine lock; TypeScript, scoped lint and all12cache regressions passed. Current process is recorded in memory.md.
No app UI, database, environment or dependency installation changed.


## Active-project repair - 2026-11-11

The user confirmed RentralMobile at localhost:3000/admin, not the separate rentral
Supabase workspace on3100. Keep npm/MongoDB/JWT. Email/password stays and Google
is an alternative; the earlier Google-only preference is superseded.

Rebuilt the actual /admin into six accessible tabs with focused review panes,
search/filter controls, explicit saved/pending gallery switches, clear owner
acknowledgment and15/30character reasons. Gallery changes atomically notify once
and refresh affected views after committed receipts; stale and unknown outcomes
retain original-command recovery. Mobile search collapse was visually found/fixed.

New web accounts choose Individual/Organization. Google uses direct verified
OAuth state/nonce/PKCE and encrypted cookies, immutable subject binding and
password-confirmed linking. Credential/email changes invalidate the binding until
reconfirmed. Current User/binding snapshots are checked under locks before issuing
ordinary Mongo JWT sessions; existing roles/gallery grants are preserved.

OrganizationApplication includes private digest-bound CAC evidence, status/reasons,
resubmission, independent checklists and original-command receipt recovery. Current
DB approval gates pages/actions/APIs; staff/account/redress have narrow exceptions.
Historical registration evidence remains protected. The proxy preserves refreshed
cookies even when later admission readiness fails. Unknown account types cannot
loop through onboarding. No personal KYC gate was restored.

Verified:1953 ordinary tests passed in149 files;107 owned real-fixture cases remain
skipped in this run. TypeScript/lint and final production build passed. Admin UI
passed40 browser checks across1440/390/320/768 with synthetic boundary fixtures and
all four real Inter weights; actual-app browser coverage passed48checks (4configured-Mux guard skips). Total browser coverage:88passed. See memory.md.
Independent auth/org review found no blocking issue; minor role-field limit fixed.

Read-only environment audit: MongoDB connection and13previous readiness markers
passed; Mux read access and Geoapify responded200. Google credentials/enable flag,
Paystack, actual email delivery, lifecycle sending and backups are not configured.
New googleAuthVersion/organizationVersion setup remains unapplied. No hosted data,
permission, provider or .env.local changes were made. Docker Desktop engine stays
stopped, so no new owned Mongo integration run is claimed. See local-setup-audit.md,
google-sign-in-setup.md and runtime-admin-auth-repair-plan.md. Changes are saved
locally; no commit/push/deployment was performed.


## Owner administration, gallery media and upload recovery — 2026-11-10

The [approved owner/admin increment](owner-admin-media-blueprint.md) implements
web `/admin` and native Admin, deliberate persisted ownership, manual document
review, audited fee waivers, revocable gallery permissions and manual inspection
review. Existing money-movement independence remains in force, including for the
owner. Active AI document screening is removed; historical findings remain.
See the [current review](owner-admin-review.md) and [operator guide](owner-admin-setup.md).

Approved gallery users can supply up to ten photos and an optional video without
fabricated recording/GPS proof. Photo-only inventory bypasses video processing;
gallery video still requires Mux. Grant revision checks and user-row writes
serialize revocation with uploads/attachment/publication. Public discovery,
profiles, saves/shares, protected media and new booking eligibility fail closed
for revoked or stale grants. Regrant does not republish: legitimate owner resave/
edit refreshes the grant snapshot and requires new review. Extra image references
are protected from deletion and checked during backup verification.

Browser gallery creation now preserves its actor-scoped form and intended upload
path before bytes are sent. Unknown acknowledgements recover through owned-file
readback after reload; a deliberate same-content/path retry follows confirmation.
Recovered bytes do not automatically save a listing, and reviewed abandonment
never deletes server files. Thirty focused recovery checks and scoped lint pass;
the final production browser suite passed **11 journeys in six files**, including
the new raw-upload readback case after reload.

The profile-photo fix preserves trusted database setup/connectivity errors instead
of mislabelling them as local disk failure. Address preflight distinguishes no
result, uncertain building, imprecise result and provider failure without exposing
GPS/provider text. Four live calls used only supplied strings; both full Lagos
addresses produced state-level confidence-0 results. Nigeria is not globally
excluded, but those buildings did not resolve. No distance was inferred and the
ordinary 100-metre/building-confidence requirement was preserved.

Verified so far: profile regressions **62 unit / 2 owned real fixtures**; focused
backend/address/gallery/public/storage/backup **214 checks in 17 files**;
owned owner/admin integration **10/10 in 29.73s**, using real JWT, bootstrap,
storage, claims, receipts, document/waiver, revocation, manual inspection and
ownership transfer, with Next adapters mocked and limiter clock isolated.
Current source TypeScript/scoped lint and offline environment inspection passed.
The complete existing owned Mongo suite passed **95 in one serial run: core 55,
financial 18, auth/closure/export 20, backup 2**; its actual backup wrapper verified
14 synthetic records, 4 files, 1 balanced journal and 1 claim, preserving the source
and quarantining restore. Owned fixtures were cleaned. Reviewed additive selected-
Atlas preparation verified **52 application collections / 156 indexes**, preserving
**53 existing collections and 14 non-marker documents** before owner bootstrap.
The subsequent dedicated bootstrap granted the exact existing active
`dannyiked@gmail.com` account ownership: **one owner**, all staff permissions,
admin availability and an audit record were verified, preserving credentials,
profile and other existing users/audits. It does not grant runtime access from
an email comparison. This intended role/audit change is separate from the
additive preparation's preservation check.
The final ordinary unit aggregate passed **1,868 / 0 failures / 107 configured
skips**; all **107** owned real cases passed separately (**95 existing Mongo +
10 owner/admin + 2 avatar**). Final production build passed Prisma generation, compilation, TypeScript
and generation progress **103/103**. Global lint and private-value delivery scan
passed (**1,191 files / nine private values / zero matches**). Focused counts
overlap the aggregate and are not additive. Verification and runtime results are recorded in the
[increment review](owner-admin-review.md) as they are completed.

Final native exports passed: Android **2,104 modules / about 5.9 MB / 38.2s**;
iOS **2,125 modules / about 5.9 MB / 22.2s**. The native intercepted preview passed
**4 journeys / 24 API calls / 0 errors / 0 outbound requests** at 320/390/768 widths.
Exports and intercepted browser runs do not establish physical-device acceptance.

Local runtime handback passed: backend **3000**, `/help` and both icon routes
returned 200; signed-out `/admin` redirects to sign-in and the admin API returns
401. Existing Metro **8090** reports running. Final offline environment and
private-value/whitespace checks passed; private environment files remain untracked.

No new environment secrets are required. The user supplied the remaining Mux
webhook value privately; key presence is not live-provider acceptance. Physical
Android/iOS camera/gallery/large-file/recovery/accessibility tests, real provider
acceptance and deployment/store release remain separate. Full Vercel hosting
still needs object storage and deliberate worker/webhook hosting. The delivery
revision belongs to Git history and the verified final handback.

## Previous recording location, branding and recovery — `cb42fd1`, 2026-11-10

The following checkpoint predates the owner/admin increment. Its environment,
runtime and acceptance counts are historical, not the current provider state.

The [approved increment](capture-location-brand-blueprint.md) is implemented and
locally verified: an online private backend location lock precedes recording;
fresh end evidence and the actual uploaded video bind to the capture; server
admission blocks submission unless Geoapify resolves a precise Nigerian
building/amenity within **100 metres**. Address edits cannot replace recording
evidence. Existing drafts remain; recordings without the new evidence require a
new take. MongoDB/JWT, npm, Paystack only and no personal KYC remain authoritative.

Web/native clients recover uncertain commands through owner-scoped status/receipt
readback. Original web commands/nonces survive navigation, and late responses
cannot modify another actor/wizard. Full browser refresh without the retained
video honestly requires retake. The shared emerald doorway/r brand, native icons/
splash and bounded reduced-motion launch reveal are complete. The favicon now
embeds RGBA PNG data, fixing Next's image-processing failure. See the
[increment review](capture-location-brand-review.md).

- **1,792 unit checks passed**, with 95 owned-fixture cases skipped by the
  ordinary invocation. Global ESLint passed. Final owned Mongo core passed
  **55/55**; separate financial/auth/backup runs passed **40** (18 financial,
  20 auth, 2 backup). These are distinct observed runs, not a claimed single
  serial 95-case execution. Actual backup wrapper: 14 synthetic records, 4 files,
  1 balanced journal and 1 claim; source preserved and restore quarantined.
- Final production Next rebuild passed: **99 static pages**, compile **8.9s**,
  TypeScript **5.5s**. All **8 production browser journeys passed in 30.7s**, plus
  **8 real HTTP fixture checks**, using owned loopback Mongo with providers off.
  The original 320px overflow assertion and both listing lost-response/retry
  journeys passed. The real stepper overflow is fixed; assertions were retained.
  Fixture `localhost-a9a64c420dd2` cleaned its owned server/database resources.
- Final Android export passed **2,094 modules / about 5.8 MB**; iOS passed
  **2,115 modules / about 5.8 MB**. Native TypeScript/scoped lint passed. Native
  intercepted capture/address preview passed **8 checks / 21 API calls / 0 errors
  or outbound requests** at 320/390/768 widths. These are local artifacts and
  controlled previews, not physical camera/GPS acceptance.
- Reviewed additive Atlas setup verified **52 application collections / 156
  indexes** and `captureVersion: 1`, preserving all **52 pre-existing collections
  and 4 non-marker documents** with unchanged preservation hashes. No reset/import,
  role grant, provider send, user-file deletion or original PostgreSQL write ran.
- Dependency audit reports **0 vulnerabilities**. Deterministic brand generation
  and 9 asset/launch regressions passed. Actual `/help`, `/favicon.ico` and
  `/icon.svg` returned 200; a completed warm nonexistent-account login returned
  401 without account/session writes. An earlier aborted cold request is not
  successful first-request evidence for this increment.
- The source/public secret scan covered **1,140 files against 8 actual private
  values**, with **0 matches**. Private env files were not edited by this increment.
  Offline env inspection found only `MUX_WEBHOOK_SECRET` still a template;
  other Mux fields and Geoapify are populated, without live-provider acceptance.

Runtime handback is verified: the existing user-owned backend on 3000 serves
`/help`, `/favicon.ico` and `/icon.svg` with 200, Metro on 8090 reports its packager
running, and a read-only Atlas probe confirms reachability and capture readiness.
No working user server was restarted and no tunnel is implied. The delivery
revision is recorded in Git history; remote verification belongs to the final
handback. The prior whole-app baseline was delivered as `6f2af2f`. Follow the
[location setup](recording-location-setup.md), [Windows Mux guide](mux-local-setup.md)
and [environment guide](environment-setup.md). Real Android/iOS camera/GPS/slow-
storage/launch checks, provider acceptance, and Vercel object-storage/worker
hosting remain separate. No public tunnel, real provider send/charge, deployment,
EAS/store build or release was performed by this work.

## Baseline source and local verification — 2026-11-10

The evidence below records the previously delivered whole-app revision
`6f2af2f`; current increment results are above. Its pre-push handoff wording is
historical and does not mean that baseline remains unpushed.

The approved [completion blueprint](remaining-work-blueprint.md) is implemented
for Expo Android/iOS, npm, local Next.js, saved Atlas/MongoDB/JWT and private local
storage, with Paystack only and no personal KYC onboarding. **Source and local
validation are complete, including native publication-fee actions.** See the
[31-area matrix](completion-status.md), [final review](final-review.md), and
[environment guide](environment-setup.md). Git delivery is being finalized;
physical-device/provider/store release acceptance remains separate.

- Unit aggregate: **1,678 passed**, with 89 fixture cases skipped by the ordinary
  unit invocation and then executed in the deliberate owned Mongo run. That full
  suite passed **89 in one
  serial sequence: core 49, financial 18, auth/closure/export 20, backup 2**.
  This includes the four new fee/mode/archive/callback cases and real push races.
  Earlier resource-contention failures at the old 5s integration timeout are
  superseded by this successful full run. The owned-fixture default is bounded
  at 15s, explicit case overrides remain, and the unit default stays 5s. The one
  deliberate five-KDF unit case has its own 15s timeout; assertions and password
  parameters were unchanged. Final source checks include the safe cross-module
  readiness-error mapping and required CORS account header.
- Actual backup wrapper passed **14 synthetic records, 4 files, 1 balanced
  journal and 1 claim**, preserving source and quarantining restore. All owned
  Mongo/browser/backup containers were removed. No selected-Atlas backup or
  automatic recovery cutover was performed.
- Final production Next build passed: **97 static pages**, compile **49s**,
  TypeScript **108s**, no warnings, after the bounded startup, safe error helper
  and CORS fixes, with all three owner publication-fee routes.
  Android export passed **1,787 modules / about 4.8 MB**; iOS **1,808 modules /
  about 4.8 MB**; web **1,250 modules / 45 chunks**. The web export used an HTTPS
  fixture origin through a process-only override; private environment files
  were not rewritten. These are local artifacts, not EAS/store/device builds.
- All **6 final production web journeys passed in 57.5s**, plus **8 real HTTP
  fixture checks** including native-fee 401/409/404 ownership/account/provenance
  denial and **zero PaymentIntent writes**. Fixture
  `localhost-b3f03e630fe6` blocked providers and removed owned resources.
- Native publication-fee browser acceptance passed **8 checks / 35 mocked API
  calls / 0 errors or outbound requests**, at **320/390/768** widths (ignored
  `test-results/mobile/listing-fee-p15`). Own actor/listing/current-mode proof,
  truthful historical-mode records and durable no-automatic-replay recovery are
  implemented. The earlier missing native fee action is closed.
- Earlier controlled previews remain separate evidence: sponsored discovery
  **6 checks/54 mocks**, push **7 checks/29 mocks**, dashboard **4 checks/4 calls**;
  real hardware/provider delivery is not inferred from these intercepted runs.
- Final root ESLint and mobile TypeScript passed. Production TypeScript passed
  as above. Prior backend/mobile environment checks, Expo Doctor **20/20** and
  full dependency audit **0 vulnerabilities** remain valid; the fee increment
  changed no dependencies or required keys.
- Reviewed additive Atlas setup checked **51 collections / 152 indexes** while
  preserving **all 31 pre-existing collections and 2 non-marker documents with
  unchanged before/after hashes**. Feature markers are prepared. The fee change
  added no schema and required no further setup. No reset/import/role grant,
  provider activation, user-file deletion or original PostgreSQL write occurred.
- Final source/public-artifact secret scan: **1,170 files**, **2 actual backend
  secret values**, **0 matches**. Private env files are untracked and the local
  mobile API origin is not in tracked source. Staged-content review still
  precedes commit/push.

Native fee checkout/reconciliation uses the existing collection services and
shared fixed **100,000 kobo / NGN 1,000** policy. Exact fresh intent/URL/mode binding,
locked archived-listing denial, callback preflight and current-mode proof for new
publication are accepted; old public assets/history are not rewritten. Provider
actions remain gated. See [fee contract](listing-publication-fee.md).

Final runtime handback passed with diagnostics off: **/sign-in 200 in 10.8s** and
the **first unique nonexistent-account login 401 in 12.6s, without retry** or
account/session writes. These complete responses supersede earlier exploratory
503/aborted 30s observations; the abort's default log status was never success
evidence. Bounded 10s native Mongo connection/selection remains. Temporary traces,
helper and flag references were removed. The owned backend runs on **3000** and
Expo on **8090**; its manifest confirms Rentral, one owned development server each.
Other projects on 8081–8083 remain untouched. **Only final staged review and the
authorized Git commit/push remain; no final pushed revision is claimed here.**

Browser acceptance is now reproducible through tracked
[test-browser.mjs](../scripts/test-browser.mjs) and
[fixture config](../playwright.fixture.config.mjs): with Docker and installed
Chrome available, run `npm.cmd run build`, then `npm.cmd run test:browser`.
The wrapper uses only its owned loopback Mongo/synthetic accounts, blocks providers,
preserves the configured application database/private env and cleans owned
resources. Do not build/generate concurrently with that fixture. Syntax, lint and
discovery of six tests across four files passed; recorded real acceptance is above.

Only the core safety flag changed in private backend settings; other parsed
values/secrets/provider gates were preserved. Real Android/iOS permissions,
capture/GPS/files/interruption/background/playback/push, real merchant/provider
activation and backup/recovery custody still require their own acceptance. A
public release additionally needs HTTPS and deliberate hosting/store decisions.

## Earlier checkpoint log — superseded by current verification above

Final web account boundary: the marketplace layout captures its authenticated
actor for commerce and matching requests. Clients attach the existing
X-Rentral-Account restriction on reads and writes; switching ambient cookies
cannot silently submit old purchase commands or privacy choices into another
account. A changed captured actor remounts the workspace and discards old form
state. Four focused files passed 31 checks, including missing-actor denial and
changed-account no-replay cases; scoped lint is clean. Final aggregate build and
browser verification remain separate.

Commerce/push increment (2026-11-09): paid manual-term Insights, independently
reviewed sponsorship, labeled filtered web placement, strict order/checkout/
reconciliation APIs, coarse consented observations and member refund history are
implemented. Four actual commercial/privacy cases passed within core42. New
commercial API/policy/service checks passed 39 tests; controlled browser specs are
written and await execution. Dashboard/native web handoff discoverability is
implemented, with explicit separate browser authentication and no URL credentials.

Optional push source now includes encrypted tokens, stable installation proof,
account consent epochs, current-session binding, owner/session/account revocation,
single submission claims, ticket/receipt recovery and derived90-day metadata
pruning behind explicit gates. Eight focused push/auth/worker files passed 83
tests; source lint passed. Three real push race/retention cases were appended to
the owned core suite and await execution. No actual provider sends occurred.
Physical Android/iOS push acceptance remains outstanding. See
[push operations](push-operations.md) and [commercial boundaries](commercial.md).

2026-11-09 latest database acceptance:78/78 passed in one owned replica sequence
(core42, financial18, auth/closure/export18). Includes exact commercial collection
entitlement/reversal rules, actual media lease/webhook race, participant-scoped
ephemeral activity, monotonic reads, and own dashboard metadata projection. The
selected Atlas database was unused. Separate encrypted backup/restore fixture
passed2 actual cases, with source untouched and restored target quarantined.
Dependency audit after targeted fixes reports0 vulnerabilities; final production
build and app exports remain outstanding. Push models are generated; integration
and full aggregate acceptance are still in progress.

Native leases source (2026-11-09): member extension/early-end archives, per-lease
history, evidence selection/private copy/upload/readback, proposal forms and
counterparty decisions implemented against shared lifecycle contracts. Mobile
TypeScript and scoped lint passed; latest native API/lifecycle/messaging focused
run61 checks passed. Native protected-route integration and intercepted browser
acceptance are pending; physical document-picking/preview is not yet accepted.

Current actual database acceptance:71 owned-replica checks passed (core35,
financial18, auth/closure/export18); configured Atlas was not used. Paid commerce,
new media upload and messaging activity acceptance remain separate work.

2026-11-09 media/messaging increment: backend local-to-Mux resumable upload,
bounded unknown-create reconciliation and durable upload leases are implemented;
90 focused controlled media checks passed before the final webhook-binding
hardening (final aggregate still required). Messaging now has participant-scoped
ephemeral presence/typing, strict API contracts, paged inbox/unread state,
monotonic displayed-message read receipts and immutable message retry payloads.
25 focused messaging boundary checks passed. Web activity source/lint is complete;
native transport and combined browser acceptance remain in progress. No actual
provider upload, hosted feature preparation or deployment is implied.

Squat-Mates source increment (2026-11-09): opt-in preferences, exact monthly
budget/area overlap explanations, mutual contact requests, participant-only
messages with durable retry keys, activity/read receipts, block/withdrawal,
private report histories, and independent staff restriction/restoration are
implemented with member web screens and versioned APIs. Current visibility,
moderation, blocks and account closure are rechecked; no fake listing or booking
grants contact. Closed/withdrawn contacts retain a narrow reporting route without
hidden message/profile payloads. Focused domain/API/privacy tests passed; matching
browser acceptance is tracked separately until executed. Four matching cases
passed in the owned35-case Mongo suite (included in the final71-case aggregate
provider-agent fixture run); all owned resources were cleaned. This
increment has not prepared matching on Atlas or sent actual member messages.
See [matching contracts and boundaries](matching.md).

## Approved completion build — in progress 2026-11-09

Lifecycle/API increment (source implemented; aggregate acceptance still pending):
member notifications with cursor/read state, public host/review/listing projections,
booking feedback/report readback, own reviewed notices/appeals, claimed avatars,
and persisted analytics consent/withdrawal are implemented. Optional collection
requires database consent; locked rotation-safe mappings support withdrawal and
inactive-user retention. Owned Mongo proved the three privacy cases in its25-case
run, with application data unused.

Lease extension and early-end requests now require owned evidence, counterpart
agreement and independent current-role review. Extensions preserve original
amount/pricing/payment records; effective termination release preserves listing
review status and waits on reports/occupancy. Dispute decisions explicitly restore,
complete or cancel eligible reservations; reserved financial funds prevent restore.
Web member/staff forms, protected evidence links, cursor histories, fair leased
workers and durable incidents are implemented.162 focused checks and scoped lint
passed before final browser/aggregate fixture checks. New lifecycle/financial Atlas
preparation and real provider acceptance have not been performed for this increment.
Notification emails additionally require NOTIFICATION_EMAIL_ENABLED and a valid
NOTIFICATION_EMAIL_SINCE cutoff; old pending records stay in-app without bulk mail.

User approved [remaining-work blueprint](remaining-work-blueprint.md). Current
payment direction: **Paystack only**; OPay is deferred. This section supersedes
historical completion labels below and does not claim full project completion.

- Storage claims: durable upload/attach/delete serialization, actual file checks,
  legacy references, avatars and tombstones. 37 focused unit checks and 22 real
  owned Mongo checks passed, including separate-process races. Additive Atlas
  preparation checked 30 collections/76 indexes; all existing documents across
  29 collections were unchanged. No reset, import or asset deletion.
- Database roles are the only staff authority. Administrator, moderator, finance
  and analyst permissions are separate; privileged writes recheck under the user
  lock. Role changes are audited, with a deliberate operator CLI for bootstrap.
  39 role/moderation/safety regressions, root TypeScript and scoped lint passed.
  No real member was promoted or demoted.
- Native booking detail/actions, quotes, hold conversion, checkout status and
  GPS/PIN inspection check-in implemented. 67 focused checks, native TypeScript
  and scoped lint passed. Controlled Expo-web smoke: seven scenarios, 27 mocked
  API calls, 320/390/768 layouts, no page/console errors or horizontal overflow.
  Physical location/camera/provider acceptance remains separate.
- Installed 16 reviewed Expo/MongoDB/Playwright/security skills, with pinned
  provenance in skill-installation.json. SDK-compatible mobile modules installed
  through npm; existing Zod is declared directly by the mobile workspace.
- In progress: native profile/feedback/notification/privacy parity, shared API
  adapters/consent retention, Paystack provider contracts and financial lifecycle.
  Remaining blueprint phases, final environment guide and cleanup are pending.

Development process correction: duplicate Expo writers corrupted only generated
route types. Verified duplicate workspace processes were stopped and a single
Metro regenerated the file. Keep one Next development server and one Metro;
revalidate process ownership rather than trusting old session IDs.

## Phone runtime follow-up — verified 2026-11-09

- User-selected Atlas is preserved. Corrected public-IP drift; native TLS,
  replica-set checks and direct Prisma reads PASS. Authorized preparation:
  29 collections/73 indexes, no reset/import, original PostgreSQL untouched.
- Backend fixed to port3000/LAN and Expo kept separately on8081. Native config
  rejects guessed loopback/tunnel backends and reports actionable origins.
- Fixed failed readiness-client caching and safe auth-error redaction. Cold
  transactions now use up to5s acquire/10s execution within15s total; P2028 is
  never replayed.
- Registration after fresh backend restart201 in12.4s; JWT profile/listings and
  sign-in200. Concurrent phone background traffic means no isolated cold-only
  startup benchmark is claimed.
  Guarded cleanup removed only the owned diagnostic User and two sessions;
  diagnostic accounts remaining0. The original real account is preserved.
- Real phone sign-in200 (6.4s), profile/listings200, profile PATCH200 (6.6s), and
  subsequent messages/bookings/saves/category/location discovery200. Live member
  use confirms the prior account-flow failure is resolved.
- Latest npm test636/61 PASS; owned Mongo16/16 PASS after the timeout fix;
  foundation11 PASS; lint and root/mobile typechecks PASS. Android dev bundle
  (~6.4MB) contains the correct origin/diagnostics. No actual addresses or secrets
  are saved in tracked files.
- Next and Expo intentionally remain running; revalidate saved tool references
  before interacting. Real capture/GPS/permissions/provider acceptance is separate.
  Normal automated suites remain isolated; the owned Atlas probe used guarded
  cleanup within the authorized account-flow repair.
- Runtime source fixes are ready for the already-authorized commit/push to
  Uncleiked/rentral-mobile. Git history and the final delivery response identify
  the delivered revision.

## Current local Expo / MongoDB / JWT delivery — 2026-11-09

- User authority: Android+iOS Expo app, no KYC onboarding, npm 11.19.1 workspaces,
  Node 24.x, MongoDB/user accounts, local JWT authentication, local uploads and local
  operation. This supersedes all older Supabase/PostgreSQL/pnpm/OAuth/staging notes.
- Added Expo SDK 58 discovery/filtering, details/video, saves, booking/history,
  inbox/threads, optional profile settings and owner camera/GPS/document submission.
  Booking cards link to web for host actions/checkout/check-in; old drafts resume web.
- Removed KYC forms/initiation/actions and KYC/profile eligibility gates. Legacy
  onboarding redirects; verify initiation 410. Identity history remains truthful;
  authentication/owner/participant/staff/publication/payment safeguards stay.
- MongoDB via Prisma 6.19.3 replaces the active PostgreSQL layer. Added reviewed
  index/validator/readiness setup, actual revision locks and bounded retries,
  explicit reservation overlap checks, private ListingLocation geometry, balanced
  immutable ledger inserts, one-use paid hold credit and monthly privacy aggregation.
- Local scrypt-v1 email/password accounts, private AuthSession, 15-minute access
  JWTs and one-use rotating refresh credentials stored as hashes, with a 30-day
  session lifetime. Current database staff roles, password
  recovery codes and revocation. Fixed stale-password login, cookie/native refresh
  concurrency, delayed-signout responses and outage handling.
- Local streamed uploads validate ownership/path/size/MIME/magic and preserve real
  MOV/MP4/WebM. Private JWT file URLs support Range/HEAD; avatars are public raster
  objects. Private outbox/metadata/tombstones cannot be served as uploads.
- Added setup:local (preserves existing nonempty private values) and persistent
  loopback-only Mongo replica-set compose source. No persistent dev container was
  started automatically. Initial isolated delivery made no hosted writes. The later
  authorized Atlas setup is recorded above; no historical data import, provider
  activation, deployment or EAS/store build/submission was performed. The user authorized
  source commit/push delivery to https://github.com/Uncleiked/rentral-mobile.git;
  verify Git history/remote and the coordinating agent's final delivery result.
- Historical PostgreSQL migrations, including source-only QuickTime bucket SQL,
  are retained but are not active setup. Supabase is removed from active code/deps.
- Root/mobile READMEs, mobile-api.md, expo-implementation.md and memory.md describe
  current setup, contracts, evidence and remaining work.

### Initial delivery verification record, before the phone-runtime follow-up

- npm test: 583 tests/58 files PASS; 16 fixture integration tests skipped in the
  normal run and executed separately against the owned local replica fixture.
- Real MongoDB fixture 16/16 PASS, including transaction/auth/privacy invariants.
- Actual Next.js+Mongo localhost HTTP 34/34 PASS: JWT/no-KYC profile, upload/GPS,
  discovery/signed MOV206/HEAD, saves/chat/booking isolation, cookie/proxy refresh,
  CSRF/bearer precedence, private outbox404, reset and logout. All fixture
  processes/containers cleaned; generated Next files restored. Ignored report:
  test-results/localhost-d6caf8d21aa8/report.json.
- Root lint clean; mobile typecheck, Expo install compatibility and Expo Doctor
  20/20 PASS. Android/iOS Hermes (about 3 MB each) and web export PASS. Actual private
  JWT/Mongo/database values absent from all 85 scanned exported artifact files.
- Production build PASS: Next.js 16.4.5 compilation, strict TypeScript and
  48 generated static pages. Configured Inter font download required build-time
  network access; the network-enabled retry passed without changing the source.
- npm audit --omit=dev: 8 toolchain dependency findings remain (3 high Prisma
  CLI/config/deepmerge, 5 moderate Expo CLI/fingerprint/glob/minimatch). Supported
  updates need follow-up; no audit-clean or production certification is claimed.

Physical Android/iOS camera/GPS/permissions/playback, network/accessibility and
optional provider acceptance remain open. Earlier mocked Supabase transport smoke
predates local JWT; the actual localhost HTTP fixture above tests the current
backend. Historical counts below are not the final suite total.

## Historical checkpoints below

The following entries preserve provenance. Their stack, commands, deployment
plans, mandatory verification and feature-gate status do not override the current
implementation above. Unimplemented financial/provider capabilities remain limits.

## Vercel generated-client build fix — 2026-11-07

- Fresh Vercel install compiled JavaScript but failed TypeScript because
  `@prisma/client` had no generated `Prisma` export. The build script now generates
  the client before Next.js; strict type checking stays enabled.
- Prisma config omits its optional datasource without DIRECT_URL, so generation
  can run without migration credentials. Database commands are not added to builds.
- Node 24.x selected to match the installed supported Node major. pnpm remains pinned.
- User explicitly declined hosted migrations. No database updates or repeated
  approval requests; keep schema-dependent gates disabled.
- Verification passed: production build including generated client and strict
  TypeScript, lint,357 tests/36 files, and an independent frozen-lockfile install.
  The clean fixture had no generated client; generation and a Prisma type-import
  probe then passed without database credentials. Exact results saved in `memory.md`.

## Local configuration and continuation — 2026-11-07

- User cancelled staging and selected `.env.local`. Its API keys and both database
  connections pass credential-safe read-only checks. Supabase's public CA is saved
  privately and configured for verified TLS in both pg and Prisma migrations.
- `pnpm audit:local` found eight matching applied migrations, twelve pending,
  no unfinished/history/checksum problems, correct PostGIS placement and zero
  malformed historical Didit JSON. Pending hardening covers the reported grants,
  public media bucket and signup function findings.
- Automatic approval review rejected applying the twelve migrations because the
  `.env.local` database is hosted. The user then explicitly chose **Keep the hosted
  database unchanged**. No hosted changes made; do not apply or re-request these
  updates. Gates remain off; isolated local fixture tests may continue. See
  `local-development.md` for the unapplied migration list.
- Completed one-time hold-to-rental credit and independent safety notice/appeal
  decisions. Both retain server scopes, immutable records and explicit gates.
- Added restrictive compliance-docs legacy-policy boundary/private-bucket migration.
- All twenty migrations, safety/credit/Storage invariants and actual reservation,
  payment and credit-allocation races passed the isolated local PostGIS harness.
- Environment files and user settings preserved; filled example backed up privately
  before restoring placeholders. Source, feature notes and UI registries saved.
- Final validation: 357 tests/36 files, lint, Next route generation/strict TypeScript,
  Prisma validation, production build and all 56 responsive browser checks passed.
  Preview runs at http://localhost:3100; exact handoff recorded in `memory.md`.

## 2026-11-07 implementation checkpoint

- Replaced the homepage with responsive local photography, scoped GSAP motion,
  reduced-motion handling, native category/location search and working navigation.
- Unified marketplace top/mobile navigation; added validated parametric search,
  cursor pagination, grid/walkthrough views, details, persisted saves and real reviews.
- Added a private Media Vault and expanded backward-compatible category metadata,
  transparent optional fee inputs, studios, rental intents and marine safety fields.
- Added migration-backed reservations, bounded GPS/OTP check-in, exact integer-kobo
  price snapshots, signed Paystack collection and append-only balanced ledger.
- Added participant-only messaging/listing shares/read state, opt-in private Realtime,
  booking reviews/reports, notifications, renewal review, staff audit/document queues.
- Added consent-based first-party coarse search analytics, privacy controls,
  thresholded Insights, lifecycle expiry/reminders/retention worker and a versioned API.
- Fixed address edits retaining obsolete publication approvals. A changed address
  returns to review; confirmed bookings prevent relocation of that listing.
- Hardened Didit ordering/revocation in a separately gated migration. Current signed
  envelope and stored-session checks precede transactional identity decisions.
- Added the staging template, guarded `pnpm staging` launcher and detailed provider
  setup guide. No remote migration, live provider activation or credential change.
- Validation and remaining release blockers are recorded in
  [release-readiness.md](release-readiness.md). Continue from that document; the
  historical checkboxes below are retained for provenance.

The complete platform is still **in development**. OPay, real refund/payout execution,
default compensation, full live provider/device journeys and
production deployment are not accepted or presented as complete.

Update this file after every completed feature. Any AI agent reading this should immediately know what is done, what is in progress, and what is next.

## Current Status

### Compliance Document Storage Boundary - 2026-11-07

- Added `20261107190000_compliance_storage_boundary` without changing prior
  migrations. It explicitly makes an existing `compliance-docs` bucket private
  and restricts anonymous/authenticated reads to the exact owner's folder even
  when a legacy permissive Storage policy grants broad reads.
- Owner uploads, document previews and orphan cleanup keep their existing
  behavior. Referenced document deletion/moving remains blocked by the earlier
  committed-upload guard. Unrelated public avatar reads remain available.
- Local full migration replay and concurrency checks passed with the new policy.
  Focused fixtures cover an existing public compliance bucket, broad legacy
  reads, anonymous/cross-owner denial and owner upload/cleanup. Hosted Storage
  API/blob acceptance is still required before treating the cutover as accepted.

### Private Media Previews - Code Complete, Storage Cutover Pending

- Removed public Storage URL construction from draft resume, profile cards and
  marketplace feeds. The authenticated source endpoint reads only owner/active
  inventory, validates the stored owner path and signs a five-minute redirect.
- With Mux enabled, non-owners cannot obtain originals. Disabled mode preserves
  authenticated playback of active inventory. Compliance documents have no route
  through this endpoint. All responses are private/no-store, with no public fallback.
- Private posters bypass the Next image optimizer. Native and Mux video failures
  have keyboard-accessible retry controls; camera denial no longer hides a resumed
  draft's already-recorded preview. Existing responsive dimensions/tokens remain.
- Prepared `20260924170000_private_listing_media`; NOT applied remotely. Preserves
  existing object keys, makes the bucket private and bounds legacy broad reads with
  an owner-only restrictive SELECT policy. See `context/private-media-plan.md`.
- Added an isolated local PostgreSQL policy test (`pnpm test:storage`). It passed
  anonymous, cross-owner, legacy-policy, owner upload/cleanup and unrelated-bucket
  checks. This fixture is not the hosted Storage service or full migration replay.
- Verification passed: 159 unit tests, 28 browser checks at 320/390/768/1440px,
  local PostgreSQL policy checks, lint, TypeScript and production build. Browser
  checks cover public routes and anonymous guards, not authenticated playback or
  real provider acceptance; rendering tests verify protected poster URLs and errors.
- Milestone 08 remains partial: staged private-bucket rollout, committed-object
  deletion protection, durable orphan cleanup, live Mux and camera/GPS acceptance.
  No credentials, flags, remote assets or shared database contents changed.

### Media Worker - Code Complete, Deployment Pending

- Restored project memory and reviewed the root/context docs and relevant architect,
  Supabase/Postgres, API security, responsive-design, review and imprint guidance.
- Mux credentials are now present locally and the user reports a working CLI listener.
  Presence is not live API acceptance. MUX_ENABLED remains false; no credentials,
  feature flags, remote assets or database migrations were changed in this pass.
- Added `context/media-worker-plan.md`, the protected POST worker route and the
  bounded dispatcher/reconciler in `lib/media`. Current queued work no longer has
  to depend solely on a successful Next.js after callback once scheduling is enabled.
- Stale submitting jobs become uncertain; ambiguous jobs never get a second automatic
  create request. Known provider assets can recover missed callbacks. Compare-and-swap
  updates avoid duplicate claims and prevent stale polling from overwriting webhooks.
- Worker returns counts only, denies anonymous requests, fails closed while disabled,
  and isolates individual job failures. No new schema or dependency was introduced.
- Verification: 130 unit regressions, lint, TypeScript, Prisma validation, production
  build and 24 Playwright checks passed at 320/390/768/1440px. Small-mobile and desktop
  sign-in screenshots were visually inspected; whitespace checks passed.
  Real database races, scheduled execution and enabled media playback are not covered
  by these checks. See `context/media-staging.md` for activation and alerting.
- Milestone 08 remains partial: private originals, orphan cleanup, staging rollout,
  real callbacks/playback and camera/GPS device tests still need completion. Gemini
  configuration is still missing; do not skip this milestone or simulate approval.

### Media Processing - Implementation Added, Acceptance Pending

- Added the gated Mux pipeline described in `context/media-plan.md`: one durable
  MediaAsset job per submitted listing, atomic dispatch claim, signed-only assets,
  bounded retries and explicit uncertain-submission handling.
- SDK-verified webhooks fetch current provider state, bind media/asset IDs, and
  transactionally store deduplication receipts and status. Media callbacks never
  activate listings. Playback requires an authenticated owner or active inventory,
  uses 15-minute signed tokens and denies caching.
- Wired Mux Player into feed/profile cards, owner processing status and guarded
  retries. No new-table queries occur while disabled; existing Storage playback
  remains unchanged in this default mode.
- Fixed upload rejection cleanup to wait for all uploads; retained originals after
  ambiguous save responses; preserved committed save results after refresh failures.
  Corrected codec-qualified MP4 extensions and removed fabricated 120-second badges.
- Added 36 regressions (100 total), including real SDK signature verification,
  source/output validation, ownership, duplicate/early/reordered events and failure
  handling. Twenty browser checks passed across 320/390/768/1440px for existing
  public/auth flows and disabled-mode safety. These do not prove live HLS playback.
- Final checks passed: 100 tests, lint, TypeScript/production build, Prisma schema
  validation, dependency peer checks and whitespace checks. Migration
  `20260924150000_add_mux_media_pipeline` is unapplied,
  as is the earlier profile-security migration. No remote assets/data were created.
- Follow `context/media-staging.md` before enabling. Still required: staging replay,
  actual callbacks/playback, private original-media staging, scheduled reconciliation,
  cleanup of abandoned objects/assets, and device camera/GPS acceptance.

### Sign-In Recovery - 2026-09-24

- Reproduced `/sign-in` returning 404 despite an existing route. Restarted the stale Next.js dev process on port 3000; the route returned 200 and the existing desktop auth/recovery checks passed before further code changes.
- Supabase Auth settings and the read-only database audit now connect successfully. Email auth is enabled; Google/Apple are disabled in the current project. No credentials or remote data were changed.
- Login now distinguishes service outages, rate limits, unconfirmed email and invalid credentials, and cannot succeed without a verified user. The form supports keyboard submit, persistent inline errors and recovery after failed requests.
- Provider buttons follow live Supabase settings. Local telemetry is opt-in; server analytics requests have bounded timeout/no retries. Added marketplace image size hints and corrected the logo aspect ratio.
- Server logs showed a successful login action followed by `/marketplace` 200 responses. This is runtime evidence, not a full authenticated end-to-end acceptance test.
- Database audit still flags profile-table Data API grants. The prepared security migration remains unapplied pending staging verification.
- Verified: 64 unit regressions, 16 Playwright checks across 320/390/768/1440px, TypeScript, lint and whitespace checks passed. Inspected the 320px sign-in screenshot. No production build was rerun during this targeted repair.

### Acceptance Review - 2026-09-24

The historical implementation notes below describe built features, not production acceptance. The architecture and ordered remaining work are now in `context/production-plan.md`.

- Fixed recovery route access, safe callback destinations, redirect cookie preservation, username-based KYC reapproval, typed profile submission, metadata-sync error handling, and onboarding progression.
- Listing mutations now check current database KYC/profile eligibility. Public feed/profile listings only include `active` inventory. Removed the fabricated payment account and "I've Paid" flow; submission saves as pending review without collecting a payment.
- Didit updates are scoped to the stored user/session/workflow, and `/api/verify` shares the guarded onboarding action. Same-session event ordering/concurrency and live sandbox approval/revocation remain acceptance work.
- Marketplace now renders inventory at request time and has a retryable error boundary.
- Draft publication now locks the owner/status/GPS row inside its write transaction before submission; the real concurrent-request database test still needs staging connectivity.
- Final local checks passed: lint, TypeScript, Prisma schema validation, production build, 48 Vitest regressions and 12 Playwright checks (homepage/recovery/anonymous protection at 320, 390, 768 and 1440 pixels). Browser preview is the existing server at http://localhost:3000. These checks do not prove live OAuth/SMTP/Didit/payment behavior.
- Added Vitest/Playwright checks and a read-only schema audit. Supabase rejects the configured database connection with XX000 / tenant-user not found; authenticated DB flows and migration verification are blocked until configuration/project availability is restored.
- Prepared `20260924130000_harden_profile_access` to deny Data API access to private individual/organization profiles and restrict the signup trigger. Migration is NOT applied or live-verified.
- External inputs still missing: Mux credentials, Gemini credentials, and payment-provider sandbox credentials. Do not mark provider-backed milestones complete until tested with real sandbox callbacks.

Next: restore database connectivity, replay/verify the pending migration in staging, complete authenticated/provider acceptance, then continue item 08 per the dependency plan.

### Historical Implementation Notes

Phase: Phase 1 — Foundation, Auth, & Core Infrastructure (with Profile UI pulled forward from Phase 7)
Last completed: 02 Auth, 03 KYC & Onboarding Pipeline (proxy.ts, Didit webhook, multi-step onboarding with ProfileForm, all 3 pipeline bugs fixed). Also: Marketplace Profile Page — Owner + Visitor UI (`/marketplace/profile`, `/marketplace/profile/[username]`), built ahead of schedule with real identity data (username/name/verification/account type from Prisma), real trust-stat counts via `getTrustSummary()` (with a `null`/"Coming soon" placeholder for the 3 metrics with no backing system yet), and a real empty state for listings until the Listing table exists. Profile is editable end-to-end: bio + avatar_url added to `User`, a public `profile-avatars` Storage bucket with owner-scoped RLS, live username-availability checking, Supabase secure (double-confirm) email change synced back to Prisma via `app/auth/callback/route.ts`, real Sign Out, and a Copy Link/WhatsApp/X/Facebook share menu.
Also: 05 Telemetry & PostHog Initialization — `posthog-js` client init (`instrumentation-client.ts`) + `posthog-node` server client (`lib/posthog.ts`, `flushAt: 1`, flush-per-call so events land before short-lived server actions/route handlers exit). 6 events wired to real code paths: `user_signed_in`/`user_signed_up` (sign-in actions), `verification_started` (onboarding `initiateVerification`), `verification_completed` (Didit webhook), `onboarding_completed` (`submitProfile`), `profile_updated` (`updateProfileIdentity`/`updateAvatarUrl`, tagged by `field`).
Also: Listing Capture — Full UI (build-plan.md Phase 2, Item 05). Wizard shell (Category → Walkthrough → Details → Documents → Activate → Done) now nested at `/marketplace/listing/create` (moved from a top-level `/listing/create` to match the `/marketplace/profile` convention), `useRentralStore` (Zustand) driving wizard state, category-specific metadata schemas (House/Car/Boat) in `lib/schemas.ts`. `CaptureCanvas` uses a real `getUserMedia` live preview; countdown, GPS-lock dot, document upload, and the ₦1,000 checkout screen are simulated local state — no `navigator.geolocation`, no DB writes, no Mux/Gemini/OPay calls yet.
Also: Listing Hub (`/marketplace/listing`) — "Your Listings" page reusing the existing `ListingsGrid`/`getListingsForProfile()` (previously only rendered on visitor profile views) plus a "Create Listing" CTA into the wizard. Sidebar (`MarketplaceSidebar`) and mobile bottom nav (`MarketplaceBottomNav`) "Listing" items — previously dead `href="#"` placeholders — now both route here instead of straight to the wizard. Homepage's "Create listing" CTA still goes directly to `/marketplace/listing/create`. Verified end-to-end with a headless Chrome + fake-camera-device Playwright run across both entry points (sidebar → hub → wizard, and homepage → wizard directly): real video frames rendered, correct routing at every hop, zero console errors. Also confirmed the existing `proxy.ts` auth gate correctly protects all of these routes (redirects unauthenticated visitors to `/sign-in`, then to `/marketplace`/`/onboarding` per profile state).
Also: 06 Spatial Integrity & Upload Logic (pragmatic slice — no Mux/OPay/Gemini keys yet). The wizard is now real end-to-end: `CaptureCanvas` records actual video via `MediaRecorder` (vp9→vp8→webm→mp4 codec fallback) gated on a real `navigator.geolocation` fix (recording is blocked entirely if location is denied — spatial invariant), with an in-player review of the recorded take, a Retake button, and a canvas-captured JPEG poster frame. Numeric metadata fields (bedrooms/bathrooms/sizeSqm/mileageKm/seats/capacityPersons/basePrice) are digits-only via zod regex + `inputMode="numeric"`. `DocumentUploadZone` holds the real `File` (type/size validated). On "I've Paid" (fee still simulated), the browser client uploads video/poster to the public `listings-media` bucket and the doc to the private `compliance-docs` bucket at `{uid}/{draftId}/...` (uid-first instead of architecture.md's `listings/{listing_id}/...` because the client uploads before the row exists and owner-folder RLS keys on the first path segment; server actions cap bodies at 1MB so media can't ride through the action). Then the `saveListing` server action (`app/actions/listingActions.ts`) re-validates with zod, checks path ownership, and in one transaction inserts the `Listing` row via Prisma + sets `hardware_coordinates` (PostGIS `geography(Point,4326)`, written via raw `ST_SetSRID(ST_MakePoint(...))` since Prisma treats geography as Unsupported — which also means Prisma can never SELECT it back to a client). Status starts at `pending_verification`; `listing_created` PostHog event fires. `getListingsForProfile(listerId)` is now a real Prisma query feeding "Your Listings" and visitor profiles (explicit select, never coordinates); wizard step 1 gained a "Back to Your Listings" exit link and the Done screen links to the hub. Migrations: `20260724100000_add_listing_model` (postgis extension, RLS-hardened Prisma-only table) + `20260724100500_add_listing_storage_buckets` (both buckets + owner-scoped policies).
Also: GPS capture hardening — camera/GPS require a secure context, so `pnpm dev:https` (`next dev --experimental-https`, mkcert-backed) was added for phone testing over the LAN (plain `http://192.168.x.x:3000` can never grant them; only localhost is exempt). `CaptureCanvas` now: shows a secure-connection explainer instead of a dead camera on insecure origins, pre-checks `navigator.permissions` for a hard "denied" (pill shows "GPS Blocked", clears live on unblock via the `change` event), maps `GeolocationPositionError.code` to specific instructions (denied → site settings; unavailable → OS Location Services; timeout → retry), and auto-falls back from high-accuracy GPS (15s) to network/Wi-Fi location (`enableHighAccuracy: false`, 20s, 60s cache) before surfacing an error — the path that actually succeeds on desktops.
Also: Marketplace Feed + Listing Editor + Drafts. (1) **Feed**: `app/marketplace/page.tsx` is now an async server component rendering real non-draft listings via `getMarketplaceFeed()` (`lib/listing-data.ts` — joins lister username/avatar/kyc, public Storage URLs, category-derived badges, "Pending Verification" badge until real verification lands); mock cards removed, real empty state with a Create CTA. `MarketplaceFeedCard` tolerates null avatar (initial fallback), null poster, null trustScore (hidden — no fabricated scores), and plays webm/mp4 via `src`. (2) **Drafts**: "Save Draft & Exit" appears in the wizard once a category is chosen (`SaveDraftButton`); it uploads any in-memory media to Storage (shared `lib/listing-upload.ts`, timestamped filenames under a stable `{uid}/{mediaFolderId}/` folder) and upserts via the `saveDraft` action (`listing_status='draft'`, `wizard_step` saved for resume, coords stored server-side only). Draft columns are nullable with a `Listing_posted_complete_check` DB CHECK forcing completeness for any non-draft status — save/post transactions write fields while status='draft', set PostGIS coords, then flip status last (verified against the live DB in both directions). Resume: "Continue Editing" on the hub card → `/marketplace/listing/create?draft=<id>` → server-fetched `DraftPayload` (never raw coordinates — only a `hasCoords` boolean) hydrates the Zustand store; CaptureCanvas previews the uploaded take from Storage and treats server-held GPS as locked; retake clears both. (3) **Editing**: `/marketplace/listing/[id]/edit` (ownership-scoped 404, drafts redirect to the wizard) → `ListingEditForm` edits metadata/address/price only — video/GPS/documents stay padlocked per Item 11 — via the `updateListing` action. Shared `ListingFields` fieldset now powers both the wizard details step and the edit form. Hub (`/marketplace/listing`) shows drafts + owner-only Edit/Continue buttons (`ListingsGrid`/`ListingCard` `owner` prop); visitor profiles exclude drafts.
Next: finish Item 08's Mux transcoding leg, Item 09 Gemini doc audit, Item 10 real OPay ₦1,000 fee (still stubbed: storage-direct playback, `pending_verification` status, simulated payment). Follow-ups: GC for replaced draft media objects; Feed "Book"/like/save buttons are still local-only UI.

## Progress

### Phase 1 — Foundation, Auth, & Core Infrastructure

[x] 01 Homepage & Navigation — Full UI (Hero, Value Prop, Trust Loop)

[x] 02 Authentication & Middleware Protection (Supabase Auth, proxy.ts Edge interception, sign-in/sign-up flows, OAuth callback)

[x] 03 KYC & Identity Resolution (Didit NIN/BVN/Passport Webhook, multi-step onboarding: account type → KYC → profile form → username → marketplace)

[x] 04 Database Schema & Prisma Setup (User, IndividualProfile, OrganizationProfile, WebhookLog models)

[x] 05 Telemetry & PostHog Initialization (Client & Server-side flush setup)

## Phase 2 — Hardware-Locked Inventory & AI Audits

[x] 06 Mobile-First Capture UI (WebRTC Camera & HTML5 Geolocation hooks — real MediaRecorder + GPS-gated capture with retake)

[x] 07 Dynamic Spatial Metadata Forms (Category-specific: House, Car, Boat — digits-only validation, persisted to `Listing.asset_metadata`)

[~] 08 Media Transcoding & Ingestion (Storage flow and gated Mux lifecycle implemented; migration, credentials, private originals and live acceptance pending)

[ ] 09 AI Document Verification Pipeline (Gemini 1.5 Pro Title/CAC Audit)

[ ] 10 Pay-Per-Post Spam Gate (OPay Virtual Account for Listing Fee)

[ ] 11 Listing Editor (Padlocked spatial/media attributes)

## Phase 3 — Discovery Feed & Multi-Asset Search

[ ] 12 Discovery Feed UI (Vertical Mux scroll, Glassmorphic overlays, badges)

[ ] 13 Feed Logic & Spatial Querying (TanStack Query, PostGIS ST_Distance Math)

[ ] 14 Parametric Filtering & Search Engine (Category, Budget, Amenities)

[ ] 15 Peer Reviews & Reputation System (Trust Score calc, Red Warning Banners)

[ ] 16 Dispute & Appeals System (For flagged listers to appeal warnings)

## Phase 4 — Transaction Pipelines & Escrow Settlement

[ ] 17 Proximity Handshake UI (Seeker OTP Scanner, Lister Check-in View)

[ ] 18 Residential Inspection Settlement (ST_DWithin 20m check -> OPay Payout)

[ ] 19 Direct Booking Settlement Flow (Shortlets/Cars/Boats upfront multi-day logic)

[ ] 20 Holding Lock Activation UI & 24-Hour Inventory Freeze

[ ] 21 Default Monetization Engine (Supabase Edge Function for 70/30 split payout)

## Phase 5 — Unified Messaging & AI Lifestyle Engine

[ ] 22 Real-Time Negotiations (Supabase Realtime WebSockets Chat UI & Logic)

[ ] 23 Interactive Direct-Share (Embedded asset cards with booking triggers in chat)

[ ] 24 AI "Squat-Mate" Matching (Gemini conversational agent for co-living matches)

## Phase 6 — Continuous Lifecycle & Retention

[ ] 25 Automated Notification Engine (Month 11 renewal pulses, escrow alerts)

[ ] 26 Year 2 Continuous Trust Routing (Paystack/OPay Open Banking Hash validation)

[ ] 27 Lease Termination & Asset Unfreezing (Gemini Move-Out / Vacancy Deed Audit)

## Phase 7 — Admin Command Center & B2B Insights

[ ] 28 Profile & Trust Ledger Dashboard (Active inventory, bookings, score history)

[ ] 29 Rentral Insights B2B Portal (Demand heatmaps, price elasticity, churn data UI)

[ ] 30 Administrative Master Console (Force Escrow Release, Force Refund, Dispute UI)

[ ] 31 Sandbox & Developer Bypass Flags (is_admin, admin_bypass_verification logic)

---

## Decisions Made During Build

_Framework & UI: Utilizing Next.js 16 (App Router) and React 19. All styling is executed via Tailwind CSS v4 using semantic utility classes (@theme)._

_Zero-Trust Spatial Security: Listings must be created on a mobile web interface to capture raw navigator.geolocation simultaneously with the WebRTC video. Desktop uploads of stock imagery are programmatically blocked._

_Database & Proximity Math: Supabase (PostgreSQL) is the core database, heavily utilizing the PostGIS extension. Physical handshakes are verified natively at the database level using ST-DWithin (strict 20-meter radius)._

_Financial Routing: Operating a split-escrow architecture. We generate OPay/Paystack dynamic virtual accounts for inbound funds and use their Transfer APIs to route net payouts directly to landlords' traditional bank accounts (no digital wallet required for hosts)._

_AI Gatekeeper: Google Gemini 1.5 Pro is used strictly as a multi-modal forensic auditor for Title Deeds, CAC documents, and Vacancy Deeds, expecting strictly parsed JSON responses._

_B2B Analytics First: PostHog is integrated at the server level (flushAt: 1) to capture all search patterns, checkout dropouts, and spatial defaults to feed the B2B 'Rentral Insights' portal._

_Error Monitoring: Oluso (@oluso/nextjs) is wired through root `instrumentation.ts` — `register()` installs uncaughtException/unhandledRejection handlers and `onRequestError` catches server-side errors from Server Components, Route Handlers, Server Actions, and Proxy on both Node and Edge runtimes. API key lives in `.env` as OLUSO_API_KEY (gitignored); `environment: process.env.NODE_ENV` keeps dev errors from triggering notification emails or auto-fix PRs._

_State Management: Used Zustand (useRentralStore) for transient multi-step wizard states (video recording, dynamic forms, and checkout configurations) to prevent unnecessary DB writes before the user commits._

---

## Notes

### Current verified extension — 2026-11-09

The approved completion blueprint and latest user decisions supersede historical
provider/database notes below. Paystack only, npm, MongoDB/JWT and no personal
KYC remain authoritative. Financial provider adapters, source reservations,
independent approvals, partial refunds/payouts, reversals and the explicitly gated
hold-default policy are implemented with controlled provider transport. Account
password/session controls, dual-mailbox confirmation and encrypted optional
Resend delivery are implemented. Their owned Mongo acceptance passed62cases
(31core,18financial,13account-security); focused auth/API policy checks passed102.
Neither provider activation nor real email/money movement is implied. See
context/paystack-integration.md and context/account-security.md for exact gates,
contracts and acceptance limits. Web/native/device validation is tracked separately.


_Spatial Privacy Invariant: Never expose raw hardware coordinates (hardware-coordinates) to the client-side frontend. Only expose computed distances (distance-meters) or abstracted neighborhood zones._

_Supabase Client Contexts: Strictly separate @supabase/ssr browser clients (read-only) from server clients. Webhooks and edge functions executing financial payouts or CRON updates must use the SUPABASE-SERVICE-ROLE-KEY to bypass RLS safely._

_Currency Handling: Always multiply NGN values by 100 before sending to OPay/Paystack APIs (they operate in Kobo). Always divide by 100 when reading from webhooks._

_Admin Security: The admin-bypass-verification and is-admin-override flags must always be guarded by a strict backend check validating profiles.is-admin = true to prevent production exploitation during staging/testing._

_Holding Lock Split: When a 24-hour holding lock expires, the Edge Function must programmatically distribute 30% to the platform and 70% to the asset owner's bank account before resetting the listing to 'active'._

_Listing Capture Boundary (updated with Item 06): recording, GPS, storage uploads, and the DB write are real. Still simulated/deferred pending API keys: the ₦1,000 OPay fee (button confirms without payment), Gemini document audit (docs land in `compliance-docs` unreviewed), and Mux transcoding (cards play the raw Storage file). Listings therefore stay `pending_verification` — nothing auto-activates. Wizard blobs live only in Zustand memory, so a refresh at checkout requires redoing capture/document steps (guarded with a clear error, no orphan rows; failed saves best-effort delete their uploads)._
