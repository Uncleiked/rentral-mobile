# Media Worker: Dispatch and Reconciliation

Status: implemented and locally tested. Extends milestone 08; not a production rollout.

## Scope and Boundaries

- Dispatch means submitting an existing queued MediaAsset, not creating a listing.
- Reconciliation means retrieving a known Mux asset and validating its current state.
- An uncertain submission has no confirmed provider outcome; never create it again.
- Worker execution requires MUX_ENABLED, MEDIA_WORKER_ENABLED and a dedicated secret.
  Adding credentials alone does not enable processing or authorize migrations.

## Implementation

1. Keep the existing atomic dispatch claim and add an observed-attempt condition so
   overlapping requests cannot retry the same failed preflight from a stale snapshot.
2. POST /api/internal/media-worker authenticates a server-only bearer secret before
   database/provider access. Only this exact route skips browser session middleware.
3. Each invocation selects at most two jobs per phase, oldest first. Queued and
   processing jobs must be at least five minutes old. Submission claims older than
   ten minutes become uncertain; no reset-to-queued logic is introduced.
4. Reconciliation claims a processing row through an updatedAt compare-and-swap,
   retrieves its known asset outside any database transaction, validates both
   provider ID and passthrough, then conditionally applies the existing media policy.
   A concurrent webhook wins over stale polling. No fabricated webhook receipts.
5. Return counts, never credentials, signed URLs, listing IDs or provider payloads.
   Per-job failures cannot discard the rest of a batch. Alert on failures/uncertainty.
6. Unit-test gates, authorization, races, retry bounds and reconciliation. Check the
   real route denies anonymous requests without redirects; rerun existing viewports.

## Deployment and Limits

No schema migration or new dependency is needed. Database state survives process
termination, but an external scheduler must invoke the endpoint. Deployment remains
off until separate Supabase staging verification; the request must finish before the
host timeout. Unknown provider IDs still require operator investigation. Private
originals, orphan cleanup, real provider callbacks and device acceptance remain open.

## Review

- Plan alignment: bounded dispatch, known-asset reconciliation, uncertain submission
  handling, secret gating and rollout instructions implemented without new tables.
- System integrity: no UI/database boundary change, no coordinate/provider-body
  exposure, no broad authentication bypass, no remote changes or new dependencies.
- Local verification: 130 unit tests, 24 route/browser checks, lint, TypeScript,
  Prisma validation and production build passed. Auth screenshots inspected at
  320px and 1440px; automated layout checks also cover 390px and 768px.
- Production readiness: not accepted. Real SQL concurrency, scheduler/host timeout
  behavior, missed callbacks and actual playback must be verified in staging.
