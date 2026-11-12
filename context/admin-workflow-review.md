# Admin and owner workflow review

2026-11-12. Scope: RentralMobile web admin and owner listing workflows.

## Plan alignment

PASS: separate gallery/free/direct capabilities; server-wide submitted inventory
search and filtering; member-scoped navigation; safe scoped CSV; protected media
review; partial draft save/resume at every wizard stage; saved submitted inventory;
selected publisher human-review bypass with factual requirements intact.

## System integrity

PASS: current Mongo/JWT/npm-stack architecture retained (npm commands), pinned Prisma
6.19.3 and existing mutation/audit/lock/receipt patterns reused. No client-supplied
roles/owner IDs accepted. Exact fee predicates include succeeded status, kind,
listing, payer, currency, amount and environment. Publication grants require complete
issuer/date/reason evidence. Drafts stay private. Approved organization state is
rechecked in publication transactions. Rejection/suspension creates a durable manual
review barrier. Independent document approval is never fabricated for direct users.
Dark semantic tokens, mobile fields,44px actions and responsive wrappers preserved.

## Verification evidence

- Full Vitest:161filesPASS,6opt-infilesSKIP;2,078testsPASS,113SKIP.
- npm run lint:PASS, no source warnings. Generated browser bundles are ignored.
- npm run typecheck:PASS.
- Admin synthetic Chrome:22distinctworkflows across1440/390/320/768px verified.
  Full run87/88PASS; one tablet setup was interrupted by an intentional source edit
  triggering fixture HMR. After disabling fixture HMR, targeted recovery and final
  screenshots8/8PASS. No product assertion failed in that interruption.
- Owner synthetic Chrome:32/32PASS (8workflows at4viewports), with no pageerrors,
  provider calls or horizontal overflow. Partial normal-user draft save covers
  capture/details/documents/review; direct paths cover fee/video blockers, ready,
  revoked permission and lost response followed by reload+readback without secondPOST.
- Production build:PASS on final frozen source; Next.js16.4.5, TypeScript and110staticpages completed. Verified Prisma schema/client cache reused correctly while localhostdev remained available.
- git diff --check:PASS after normalizing registry EOF.

## Limits

Docker's local daemon is unavailable. Owned Mongo integration tests are safely
skipped; new guarded acceptance scenarios are saved for a working replica-set
fixture. Synthetic browser tests do not certify hosted transactions or provider
acceptance. No hosted database, private environment values, Atlas/Vercel settings,
remote indexes, dependencies or production deployment were changed. Existing native
app/device acceptance is outside this web admin extension.

## Repeatable commands

Use npm.cmd in PowerShell. npm run test:admin-ui runs the admin browser fixture.
Run npm exec -- playwright test --config playwright.owner-ui.config.mjs for owners.
Both use loopback-only fixtures and synthetic accounts; they do not load .env files.
With Docker available, npm run test:mongo -- --admin-only starts the guarded owned
Mongo replica fixture; never substitute a hosted URI or run db:setup as a test.
