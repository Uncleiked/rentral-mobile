# Rentral completion blueprint

Prepared 2026-11-09 using the requested architect workflow. Status: reviewed
inventory and implementation approved by the user.

## Authority and shared language

The latest user decisions take precedence over historical documents: Expo for
Android/iOS, npm workspaces, a local Next.js backend, the saved MongoDB Atlas
connection, JWT accounts, and no personal KYC onboarding. Preserve existing
accounts, uploads and financial history. Do not modify the original PostgreSQL
database or restore Supabase/OAuth/Didit requirements.

- **Complete app:** implemented member/host workflows with native screens, shared
  server services, persistence, authorization, failure handling and verification.
  Staff and institutional tools are complete web portals unless the user chooses
  native staff/enterprise screens as well.
- **Verification:** asset evidence and human review; it does not recreate personal
  KYC or claim that GPS or AI guarantees ownership.
- **Payment collection:** a provider-confirmed receipt. Refund, payout, dispute
  resolution and escrow/custody are separate operations.
- **Provider-ready:** the integration and recovery paths are implemented and
  tested with controlled fixtures. Real provider acceptance additionally needs
  appropriate test credentials, account capabilities and merchant arrangements.
- **Cleanup:** remove proven unused code and generated artifacts after validation.
  Preserve private settings, user storage, database data, Git history, required
  migration evidence and user-authored skill/config files.

## Existing implementation to retain

Working native auth/recovery/session handling; Explore/basic filtering/pagination;
details/private video; saves; booking requests/history; durable conversations and
message history; owner inventory and native camera/GPS/document submission.
The shared backend already implements much of booking state/pricing/check-in,
hold credit, reviews, safety appeals, notifications, analytics consent, listing
editing and draft resume for the web. Extend these services rather than duplicating
their rules in mobile components.

The current baseline is commit e26105f: 636 unit regressions, 16 owned Mongo checks,
root/mobile TypeScript and lint passed. Live phone account/member use was verified.
This is a baseline, not evidence that the remaining features below already work.

## Requirement and gap inventory

Historical tracker IDs are references, not current completion checkboxes.

| Tracker area | Existing code | Work to finish |
| --- | --- | --- |
| 01–05 foundation | Home/navigation, JWT/Mongo, telemetry primitives | Reconcile obsolete runbooks; real recovery/email change/password/session settings; consistent persisted staff roles; privacy/account lifecycle |
| 03 personal KYC | Removed by user request | Keep removed; retain only necessary historical evidence without access gates |
| 06–11 inventory | Native capture, web editor/vault, local private files, provider screening adapters | Protect committed objects and submit/delete races; verify uploaded objects before attach; native full metadata, drafts/resume/editor/vault; reliable large uploads and publication pipeline |
| 12–14 discovery | Advanced web filters, native basic search, public projections | Native advanced filters/walkthrough feed, focus refresh, complete public host/detail projections and archive cursors |
| 15–16 trust | Booking reviews, reports, safety notices/appeals on web | Native feedback/reports/appeals; audited booking resolution out of disputed; evidence-derived reputation and staff review UX |
| 17–20 reservations | Shared booking/check-in/hold/pricing/credit services | Native booking details/actions/quotes/checkout/check-in/hold conversion; request idempotency and reliable uncertain-outcome recovery |
| 18–21 settlement | Verified collection and initial balanced ledger | Recipient onboarding, bounded refunds, payouts, reversals, reconciliation, custody/fee policy and reviewed hold-default dispositions |
| 22–23 messaging | Participant messages, retries, read state and rendered listing shares | Native share composition/unread updates; typing/presence/reconnect transport; privacy controls without leaking other conversations |
| 24 Squat-Mates | Future-feature page | Opt-in household preferences, explainable matching, mutual contact, block/report, optional evaluated AI assistance; no invented financial-risk claims |
| 25–27 lifecycle | Notifications, renewal submissions, worker endpoints | Native notification/renewal views; actual delivery and local scheduling; renewal decisions/extensions; termination evidence/review and safe vacancy transitions |
| 28 dashboard | Real counts/history, web vault | Native dashboard/leases/vault, saved searches, real response/show-up metrics and settings |
| 29 Insights | Thresholded coarse monthly observations | Consented conversion events, useful charts/aggregations, entitlements/subscriptions, sponsored campaign workflows with labeled placement |
| 30–31 operations | Web review queues and audit, provider gates | Complete settlement/renewal/dispute/termination queues, current-role enforcement, recovery/dead-letter controls, retention and restore runbooks; no production bypass |

## Structured implementation

### 1. Protect data and define shared contracts

1. Add a reference/claim boundary for stored objects. Submission must verify the
   object and claim it transactionally; every removal path must respect claims.
   A committed object cannot disappear during concurrent submission/deletion.
2. Add scoped request idempotency for creates and stable cursor archives where
   current hard windows prevent managing older records.
3. Share strict request/response contracts between API and native clients. Reject
   malformed success payloads; never silently replay uncertain financial creates.
4. Make persisted server-owned roles authoritative, with deliberate bootstrap and
   immediate revocation. Preserve independent-review requirements and append-only
   audit. Never infer privileges from editable profiles.
5. Apply additive, versioned Mongo changes with fixture upgrade tests and backup/
   preservation checks before preparing the selected Atlas database.

Acceptance: object reference/race tests, participant/owner/staff denials, immediate
role revocation, immutable ledger/audit checks, and existing account-flow regression.

### 2. Complete native member and host workflows

1. Booking detail/actions, exact quotes, deadlines, holds/credit, checkout status,
   cancellation and GPS/code inspection check-in.
2. Full category metadata and optional fees; server-backed draft save/resume,
   sealed posted editing, media-vault access and interruption-safe upload state.
3. Advanced search/filtering and feed playback with background/off-screen pause.
4. Public host profiles, avatar changes, reviews/reports/appeals, complete account
   settings, saved searches, dashboard and active lease summaries.
5. Notifications, renewal/termination status and privacy/analytics consent routes.
6. Message share composition, unread state, typing/presence and reconnect/gap
   recovery. Preserve existing durable IDs, history, read state and authorization.

Acceptance: native routes perform supported operations directly; a provider-hosted
browser checkout can remain an explicit payment step, but ordinary booking/owner
actions must not require the web handoff. Every screen handles loading, empty,
permission denied, offline, timeout and uncertain-result states.

### 3. Complete operations and lifecycle

1. Explicit audited reservation resolution after disputes, separate from money.
2. Renewal approve/reject/evidence review and locked date extension with overlap
   checks; external references never become verified payments by assertion.
3. Termination evidence, counterpart/staff review, dated inventory release and
   notifications while preserving contract/payment history.
4. A locally runnable scheduler with durable leases, fair batches, crash recovery,
   safe retries and operator reconciliation/dead-letter views.
5. Real email recovery/confirmation and transactional notifications; optional push
   delivery with Expo development-build/APNs/FCM requirements documented.

Acceptance: restart/overlapping-worker tests, later-page reminders not starved,
one-use confirmations, privacy-safe delivery, and no automatic money movement
from merely closing a report or approving an AI signal.

### 4. Complete providers and financial workflows

Approved provider for this delivery: Paystack, extending the existing adapter.
The user initially selected both providers and subsequently explicitly changed
the choice to **Paystack only for now**.

1. Verified collection terminal states, streamed bounded webhook parsing,
   initialization/reconciliation recovery and native checkout return/status flow.
2. Verified bank-recipient setup, refund requests/approvals, payout approvals,
   idempotent provider operations, append-only settlement/reversal journals and
   explicit unknown-outcome reconciliation.
3. Reviewed inspection/hold-default settlement policies, including the documented
   70/30 rule only when the selected merchant product and accepted policy support
   it. Collection alone is never represented as escrow or a completed payout.
4. Complete publication without requiring an external service to fetch a LAN URL:
   use supported upload/push or provider-direct-upload flows for Mux, local worker
   reconciliation and signed playback. Keep original files private.
5. Gemini reads authorized bytes server-side and remains advisory. Geoapify and
   human review retain explicit outcomes. Keys alone do not satisfy publication.
6. OPay is deferred by the user's latest instruction; do not add an unused OPay
   switch, invented endpoints or simulated success.

Acceptance: controlled provider contract fixtures, duplicate/out-of-order events,
partial refunds, reversal and timeout recovery, exact kobo accounting, and no live
charge/transfer until the configured account and workflow are accepted.

### 5. Complete matching and commercial surfaces

1. Opt-in co-living profiles and explainable matches using relevant stated
   preferences, controlled disclosure, mutual contact and block/report paths.
   AI can assist with explanations; it must not invent matches or credit scores.
2. Insights charts and validated conversion observations with consent, deletion/
   retention controls and existing minimum-contributor privacy thresholds.
3. Paid Insights entitlements/subscriptions and sponsored listings/campaigns,
   with clear ad labeling, staff controls and provider-confirmed billing.
4. Evidence-derived reputation, response/show-up metrics and history. No fabricated
   wallet balances, creditworthiness guarantees or predictive claims without data.

### 6. Verify, document and clean up

1. Run focused/domain tests, real owned Mongo races, API journeys, typechecks,
   lint, Android/iOS exports and production build.
2. Exercise browser/native flows, both platform permissions, interruption and
   accessible navigation; distinguish device/provider acceptance from mocks.
3. Publish a current requirement/status matrix replacing misleading legacy boxes.
4. Produce a step-by-step environment guide covering backend/mobile files,
   required/optional keys, safe defaults, generation, provider setup, local callback/
   polling topology, worker commands, expected results and troubleshooting.
5. Remove proven-unused mock components, retired runtime helpers/dependencies,
   scratch files and verified generated backups. Preserve operational data and
   needed history; verify absolute workspace targets before recursive cleanup.
6. Update memory, UI registries and handoff; commit/push the completed reviewed
   source to the already-authorized rentral-mobile repository.

## Environment guide deliverable

The final guide will document the configuration actually used by the completed
code, not claim that current unused flags work. It will cover Mongo/JWT/storage,
mobile API origin, roles, email/recovery, provider payments, Mux/screening/geocoding,
workers, notifications/push, privacy/analytics, optional telemetry and any new
encryption keys. Only placeholders/generation commands go in tracked examples.
Existing secret values remain private and are preserved.

## Confirmed decisions

1. The user approved this scope/order and native member/host + web staff/Insights
   division.
2. Paystack only for the current delivery; OPay deferred by later user steering.

Provider credentials and account capabilities can be supplied privately while
implementation continues. Missing live credentials do not justify fake successful
payments, payouts, email delivery, media acceptance or production certification.
