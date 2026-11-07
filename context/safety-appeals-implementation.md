# Reviewed safety notices and appeals

Updated: 2026-11-07. Code and local unit verification; hosted acceptance remains separate.

## Implementation plan and decisions

- A report is an allegation tied to a booking. It does not automatically change a
  member's reputation, publication eligibility or public profile.
- A safety notice is a human finding following evidence review by independent staff.
  Staff select a category, record at least 30 characters of reasons and explicitly
  confirm they reviewed the evidence. The subject is derived from the report's
  booking and reporter; the browser cannot choose an arbitrary subject.
- An appeal is the affected member's one response to that notice. A second staff
  reviewer can uphold or remove it, recording a decision visible to that member.
- Removed findings and final appeal decisions remain part of private review history.
  A new finding requires a separate eligible report. No automated fraud or guilt
  determination is made from star ratings or AI signals.

The existing user authorization to continue implementation covers routine design
choices. Architect, Supabase, responsive Tailwind, imprint and review skills applied.
Installed Next.js16 `use-server.md` and `page.md` read before implementation. Supabase
changelog and RLS guidance checked; Prisma migrations remain the schema source of truth.

## Files and boundaries

- `lib/trust/safety-policy.ts`: strict inputs, participant-derived subject,
  independent reviewer checks and fixed public caution text.
- `lib/trust/safety.ts`: additive cutover gate, explicit projections, current staff
  identity checks, row-locked notice/appeal mutations, audit and notification writes.
- `app/actions/safetyActions.ts`: session authentication, server staff allowlist,
  typed error feedback and profile/admin/appeal revalidation.
- `components/trust/SafetyNoticeBanner.tsx`: public presence of an active moderated
  finding only. No report text, reporter identity or reasons are sent to visitors.
- `SafetyNoticeAdminQueue`, `SafetyNoticeControls`, `SafetyAppealControls`: staff
  review workspace on `/marketplace/admin` with mobile-first forms and clear reasons.
- `SafetyAppealForm`, `/marketplace/appeals`: affected-member history and response.
  Own/visitor profiles show the banner; the owner profile always links to appeals.

`SafetyNotice` links one report to its reported participant, issuer and optional
appeal. `SafetyAppeal.notice_id` is unique, so concurrent submissions cannot create
multiple appeals. Notice-first locks serialize submissions/decisions; staff identity
is locked and reread before a privileged mutation. Notice, audit and notification
writes share a transaction; the audit table already rejects update/delete.

## Access, privacy and deployment

- Both `RENTRAL_PLATFORM_ENABLED=true` and `RENTRAL_SAFETY_ENABLED=true` are required.
  Default false. No new-table reads occur from profiles, queues or appeals while off.
- Apply `20261107170000_safety_appeals` before enabling. Root owns Prisma generation
  and staging/local deployment coordination; this subtask never reads environment
  files, touches a remote database or enables payments.
- Staff access uses exact `RENTRAL_ADMIN_IDS` values from server configuration,
  followed by current persisted KYC and username checks. Editable metadata cannot
  grant privileges. Staff involved in a booking cannot issue or decide its notice.
  The original issuer cannot decide the appeal; configure two reviewers for redress.
- Appealing requires an authenticated session and an existing account, but remains
  available after KYC revocation. The proxy has a narrow authenticated exception for
  `/marketplace/appeals`; other protected routes keep onboarding/verification gates.
- New tables enable RLS and revoke public/anon/authenticated Data API privileges.
  Only authorized server projections serve the member/staff views. No raw government
  identifiers, GPS, private message content or banking data are added.
- Staff reasons are shared with the affected member. UI warns staff not to reveal
  reporter identities or sensitive evidence; original reports are staff-only.
- SQL triggers enforce participant subject binding, independent decisions, immutable
  original findings/statements, final decision immutability, and no history deletion.
  Notice removal requires a recorded accepted appeal. The service saves removal and
  audit atomically; a pending appeal leaves the notice active.

## Verification and review

- 14 focused unit/security regressions passed in `tests/safety-security.test.ts`:
  feature gates, strict fields, current staff KYC, server-only privileges, participant
  subjects, public projection, affected-only appeal, duplicate/independent decisions,
  final-state replay, audit failure and revoked-account route access.
- `pnpm exec tsc --noEmit` passed with generated Prisma types.
- `tests/database/safety-assertions.sql` is a rollback-contained addition for the
  existing labelled local PostGIS fixture. It checks browser grants/RLS, invalid
  subjects/issuers, duplicates, independent reviewer and immutable private history.
  Root coordinates execution with the wider migration/concurrency suite.
- Full lint/build/browser regressions are coordinated by root after source freeze.
  Authenticated production/provider and staff/member browser journeys are not claimed.

Review: plan alignment and system integrity checked. No source-level blocker found.
Acceptance still requires actual migrations plus authenticated issue → appeal →
independent decision → public-banner removal, keyboard/viewport testing and two
configured staff identities. Manual evidence review remains an operational responsibility.
No automated reputation ranking, payout/refund, suspension or credit scoring added.

## Runner recovery

PowerShell execution policy blocks `pnpm.ps1`; the global `pnpm.cmd` executable also
tried an inaccessible engine-store lock. This was a local runner issue, not an
application failure. `/recover` diagnosed a targeted environment issue. Commands ran
successfully through the existing pnpm10.28.2 JS CLI using Node; no execution policy,
machine configuration, dependency versions or secrets were changed.
