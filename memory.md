# Memory — Owner administration and approved gallery media

Last updated: 2026-11-10 Africa/Lagos. The user approved the owner/admin blueprint.
Source, current-source local verification and runtime handback are complete.
Selected Atlas preparation and named-account ownership are verified. Git history
and the final handback identify the delivery revision.
Check actual Git/process state
and context/owner-admin-review.md before assuming any operation ran.

## What was built

Web /admin and native Admin share current-role APIs and audited command receipts.
The deliberate bootstrap binds ownership to the existing active account requested
by the user, dannyiked@gmail.com; ordinary email sign-in never grants a role.
Ordinary staff, suspension and account-closure flows protect the owner. Transfer
uses its own audited operation. Source includes member/staff controls, gallery
permission decisions, document review, fee waivers and manual inspections.

Active Gemini document screening is removed. Human approval binds to the exact
private file/digest. Fee waiver means waived, not paid; it creates no payment or
journal fiction. Owner-self listing review requires an explicit detailed override.
Financial and inspection participant independence still applies to the owner.

Gallery permission is separate from KYC. Current grant/revision is rechecked for
upload/save/submit/edit/publish, with actual User-row writes to serialize
revocation. Server-built proofs bind owned byte-validated objects/digests; every
photo is protected from deletion and verified by backup restoration. Photo-only
listings need no Mux/GPS. Optional video keeps Mux's 120s/200MiB ceiling. Public
origin/trust labels are explicit, with no fabricated capture or GPS match.
Revocation hides inventory; regrant requires legitimate resave/edit and new review.
Existing booking, evidence, file and financial history remains.

Profile upload errors retain trusted Mongo setup/connectivity diagnoses rather
than claiming local disk failed. Capture preflight adds opt-in bounded lookup
reasons with legacy strict-response compatibility. Four live Geoapify calls used
only supplied strings; both full Lagos addresses returned state-level confidence 0.
No private recording GPS was read/sent and no distance was inferred. Ordinary
recorded listing admission keeps its precision/confidence and 100-metre boundary.

## Decisions made

- Preserve Expo Android/iOS, npm/Node 24, Next.js, Prisma 6.19.3 MongoDB, JWT,
  private local filesystem storage, Paystack only and removal of personal KYC.
- User explicitly approved context/owner-admin-media-blueprint.md, named-account
  bootstrap, necessary additive preparation, cleanup/testing/guidance and existing
  repository delivery. Do not reopen routine authorization or add store/deploy scope.
- No new admin/owner environment secret is required. Owner identity is persisted
  by account ID. Existing backend Geoapify/Mux/Paystack configuration stays private.
- Preserve .env.local, mobile private settings, uploads, installed skills, original
  PostgreSQL/history and financial records. Never print keys/URI/private IDs or
  put backend values in public mobile configuration.
- Real provider payment/payout, public deployment and EAS/store release remain
  separate. Full Vercel use needs object storage and reviewed workers/webhooks.

## Problems solved

State-only or uncertain address results are not evidence of provider outage.
The API opts newer clients into ?details=1; older strict clients keep their exact
response shape. New owner media fields are optional for older recorded payloads.
Gallery source bypasses recording only under a current explicit server grant.
Published/suspended gallery edits after regrant refresh the grant snapshot and
force manual review, preventing automatic republication.

Root accepted and implemented one additional review finding: web gallery uploads
previously chose a new random path after an unknown byte-upload acknowledgement.
The source now persists the intended path/form before bytes, performs owned-file
readback after interruption/reload, and requires deliberate same-content/path
retry using a full chunked WebCrypto fingerprint. Reviewed abandonment retains
other work and does not delete server files. Thirty focused checks and scoped
lint pass; the final production browser suite passed all 11 journeys in six files,
including the third new unknown-upload/readback journey.

## Current state

- Prior delivery cb42fd1 contains the recording-location/brand/favicon increment;
  baseline6f2af2f contains whole-app completion. Preserve them as historical evidence.
- Profile focused 62 unit + 2 owned real fixtures passed. Backend/address/gallery/public/
  storage/backup focused 214 checks / 17 files passed; counts overlap the aggregate.
- New owned owner/admin integration 10/10 passed in 29.73s with real JWT/bootstrap/
  storage/claims/receipts/documents/waivers/revocation/manual/transfer; Next adapters
  mocked and limiter clock isolated. Existing owned Mongo passed all 95 in one
  serial run: core 55, financial 18, auth/closure/export 20 and backup 2. Actual
  backup wrapper verified 14 records / 4 files / 1 balanced journal / 1 claim;
  source preserved, restore quarantined and owned fixtures cleaned.
- Native 114 focused checks, TypeScript/scoped lint passed; intercepted native preview
  4 journeys / 24 calls / 0 errors / 0 outbound at 320/390/768. This is not device acceptance.
- Global ESLint and the final ordinary unit aggregate passed: 1,868 / 0 failures /
  107 configured skips. Owned real suites have separate evidence; do not add
  overlapping focused counts. Earlier query expectation failures were corrected
  with exact selectors and privacy sentinels. Upload-recovery source is frozen;
  production TypeScript/build passed, including Prisma generation and Next
  generation progress 103/103. Final production browser acceptance passed all
  11 journeys in six files. All 107 configured real-fixture skips ran separately:
  existing Mongo 95, owner/admin 10 and final current-source avatar 2, all passed.
- Environment format check passes. The user supplied Mux webhook configuration
  privately. No provider acceptance is inferred from populated values.
- Selected Atlas additive setup verified 52 application collections / 156 indexes,
  preserving all 53 pre-existing collections and 14 non-marker documents. Its
  preservation report is test-results/selected-mongo-preparation-1794329083111.json.
  The subsequent dedicated audited bootstrap granted the exact existing active
  dannyiked@gmail.com account ownership: one owner, all staff permissions and
  adminAvailable verified; credentials/profile and other existing users/audits
  preserved. Result: test-results/selected-owner-application.json. Email text never
  grants a role during ordinary sign-in. Preparation preservation preceded this
  deliberate role/audit change.
- Final native exports passed: Android 2,104 modules / about 5.9 MB / 38.2s;
  iOS 2,125 modules / about 5.9 MB / 22.2s. Dependency audit reported zero findings.
- Final private-value delivery scan checked 1,191 source/public/native-export
  files against nine actual private values: zero matches. Environment files remain
  private/untracked. Final offline environment and whitespace checks passed.
  Git history and the verified final handback identify the delivered revision.
  The selected-database owner grant is complete; do not repeat it blindly.
- Backend 3000 was restarted and verified: /help, /favicon.ico and /icon.svg
  returned 200; signed-out /admin redirects to sign-in and /api/v1/admin returns
  401. Existing Metro 8090 returns packager-status:running. Preserve unrelated
  projects 8081–8083 and Docker resources.

## Next session starts with

Read the current increment review, Git status/log/remote and runtime state. Finish
only any work that truly remains from the current handback. Do not repeat owner
bootstrap blindly; use its read-only dry run and existing persisted account role.
Then perform deliberate physical Android/iOS camera/gallery/large-file/offline/
startup/accessibility acceptance and selected live-provider workflows as needed.
Use context/owner-admin-setup.md, environment-setup.md, document-providers.md and
mux-local-setup.md for operational instructions. The exact delivery revision is
recorded in Git history/final handback, not a self-referential committed hash.

## Open questions

No further product clarification is needed for the approved increment. Real
building-level coverage for the supplied streets remains unavailable from the
observed Geoapify responses; another key is not assumed to solve data coverage.
The admin-approved gallery/manual-review path is an explicit exception, not a
false GPS match. Provider/device/store/deployment acceptance remains separate.
