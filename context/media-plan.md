# Milestone 08: Mux Processing

Status: gated integration implemented and unit-tested; staging/provider acceptance required.

## Boundary

Keep the existing Storage upload and listing transaction. When `MUX_ENABLED=true`,
submission atomically adds one durable MediaAsset job. A processed video means
playback is available, not that identity, ownership, documents or payment passed.
Never activate a listing from a media webhook.

## Design

1. MediaAsset belongs to one submitted listing; its source path is immutable.
   Unique listing and provider IDs prevent double attachment. RLS is enabled and
   Data API grants denied. No coordinates or raw provider payloads are added.
2. An atomic queued-to-submitting claim allows only one asset-creation request.
   Use Mux's official SDK, signed-only playback, bounded timeout and no automatic
   create retries. A network-ambiguous create is `uncertain`, never blindly retried.
   The internal media UUID in passthrough allows an early webhook to recover it.
3. Next.js `after` starts queued work opportunistically. The DB record survives
   interruption; an owner action can dispatch queued work. The protected worker
   in `media-worker-plan.md` can also dispatch queued work and reconcile known
   provider assets. Scheduling is not deployed yet. Unknown submissions require
   operator reconciliation and are never automatically resubmitted.
4. Verify the raw-body webhook with the SDK before trusting its fields. Fetch the
   current asset from Mux rather than applying possibly out-of-order snapshots.
   Lock the media row, bind passthrough/provider ID, and commit event receipt plus
   state together. Duplicate deliveries are harmless.
5. Authorize playback on the server: current authenticated owner or an active
   listing. Mint short-lived signed tokens; never expose the signing private key.
   Mux Player handles adaptive HLS. No unsigned fallback after Mux is enabled.
6. Show honest processing/failure states and a bounded retry for preflight failures.
   Asset processing failure/unknown submission never creates another paid asset
   automatically. No fabricated progress percentage.

## Rollout and Limits

Default disabled, including all new-table queries, until migration replay and real
Mux callbacks pass in staging. Existing login/listings must continue working with
no Mux credentials or new table. No remote migration is applied by this work.

The existing `listings-media` bucket remains public until the prepared private-bucket
migration is applied. Saved previews now use authorized signed-URL redirects; see
`private-media-plan.md`. Signed Mux playback alone does NOT make originals private.
Staged cutover, committed-object deletion protection, orphan cleanup and device
camera/GPS acceptance remain explicit milestone work.
Do not advertise publication privacy until that rollout is completed.

Tests cover claims, source validation, duplicate/early/reordered callbacks, invalid
signatures, owner isolation, token authorization and disabled-mode compatibility.
Real transcoding/playback and concurrent database transactions need staging.

## References

- https://www.mux.com/docs/integrations/mux-node-sdk
- https://www.mux.com/docs/core/listen-for-webhooks
- https://www.mux.com/docs/guides/secure-video-playback
- https://www.mux.com/docs/guides/player-api-reference/react
