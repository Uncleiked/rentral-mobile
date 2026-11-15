# Runtime verification follow-up

Updated 15 November 2026. The earlier unit/Mongo/mocked-browser/build results
did not establish successful runtime Follow on the selected Atlas connection.
The user's follow-up failure overrides the previous completion wording.

## Current evidence

- Actual localhost Follow failed with Prisma P2028. The first fresh diagnostic
  classified it as transaction_timeout; a later retry still returned P2028.
- The first optimization moved profile/count projections after commit and
  retained atomic follow/notification/receipt writes. It passed focused policy
  tests but did NOT resolve the user's next real retry. Do not call it fixed.
- Read-only Atlas inspection confirmed readiness, expected validators/indexes,
  valid User revision types and no current owned lock wait. Sixteen standalone
  read-only Prisma commands completed in2.478s. No hosted test writes ran.
- Added safe allowlisted error codes, unconfirmed503 responses, and transaction
  model/operation/duration tracing without query values, account identifiers,
  secrets or connection strings. Restarted only the verified localhost Next
  server to ensure fresh Prisma query-extension diagnostics.
- A real Next/browser/API/Mongo fixture is being added in
  scripts/test-social-http.mjs. Critical flows must not mock API responses.
  It uses a unique marked portable loopback Mongo database, random Next port,
  private fixture JWT/storage and disabled providers. Root-source execution
  reads ordinary env files with explicit fixture overrides; values are never
  printed and hosted connections are not used. Network-delay fault injection
  is included. Its initial staging/bundler issues are harness failures, not passes.
- The installed Playwright skill is the best supported testing option from the
  official catalogs reviewed. No extra skill/dependency/config was installed.

## Acceptance still required

Reproduce the real failure, identify the exact critical database step, then pass
actual browser/cookie/API writes under representative latency and verify reload/
other-account notifications. Cover draft/upload/publication/admin decisions,
private saves, request consent/typing, lost acknowledgements and session/account
changes. Run final regressions, real Mongo suites, lint/types/build after fixes.
External merchant/provider/device acceptance remains separate. Disabled provider
gates must remain truthful; no perfect-platform guarantee from counts.

## GitHub push issue also diagnosed

A non-mutating push dry run returned permission denied to KingDavidsHub for
Uncleiked/rentral-mobile. This is an HTTPS account/write-access mismatch, not a
missing SSH key. Owner instructions: Git Credential Manager browser login as
Uncleiked, repo-local credential.https://github.com.username=Uncleiked, then push
origin main. Alternatively grant KingDavidsHub collaborator write access.
No Git credential/configuration, history or remote branch was changed here.

