# Security review: platform domains

Reviewed 2026-11-07. Local checks are not a security certification or provider acceptance.

## Findings corrected

- **Critical: disputed rental dates.** Opening a dispute previously removed a
  rental from the availability exclusion. Migration 20261107143000 retains
  disputed rentals/holds until an explicit resolution transition.
- **Important: concurrent message retries/rate limits.** Sender-row locking now
  serializes retries and rate counts across conversations and rechecks current
  database KYC. Strict input rejects extra identity fields. Read receipts reject
  nonparticipants instead of returning success for zero updated rows.
- **Critical: publication checks.** Publication requires a recorded human
  reviewer, a finite nonnegative distance within 100 metres, a current address
  hash, configured ready video, current verified identity, and the listing
  owner's successful NGN 1,000 payment. Listing/owner locks serialize review and
  identity changes. Drafts cannot receive approval of mutable documents.
- **Important: privileged automated review.** Address/AI attempts reject
  self-review and create an append-only audit before provider work.
- **Important: delayed AI results.** Screening locks the listing, verifies that
  the document path is unchanged, and preserves human approval/rejection.
  Low-risk output remains needs_review. Approval-shaped output fails validation.
- **Important: review eligibility race.** Reviews now lock their booking before
  rechecking completion and participant membership. Subjects are server-derived.
- **Critical: global holds.** A live paid hold blocks other renters' requests,
  acceptance, inspection check-in, checkout and payment confirmation across the
  entire asset, under the listing lock. Late conflicting funds require review.
- **Important: flexible holds.** Explicit 1–7-day holds cost NGN 20,000 per day;
  purchased duration is retained in the quote and controls server expiry.
  Discovery/API expose the deadline without holder identity. Held assets remain
  viewable, with new booking controls paused.
- **Important: opportunistic expiry.** Both scheduled and user-triggered expiry
  now mark expired paid holds requires_review and create deduplicated notices.
  They never claim refunds, compensation or split payouts occurred.

## Verified boundaries

- Staff and insights access use exact server-configured identities; editable
  user metadata/action fields cannot confer privileges.
- Message and review mutations require current verified identity. Existing
  conversation reads remain scoped to authenticated participants.
- Analytics requires platform/configuration, a sufficiently long secret and
  consent before auth/database work. Exact addresses/coordinates are rejected.
  Monthly HMAC identifiers and daily deduplication omit raw identity. SQL
  withholds groups below ten distinct current-month contributors.
- Compliance reads validate owner paths, MIME and size before downloading.
  Public API projections omit private paths, raw coordinates and review notes.
- Isolated SQL checks cover migration replay, financial RLS/grants, participant
  chat/Realtime with broad legacy policies, upload protection, disputed/date
  overlap, concurrent bookings/settlement and balanced append-only accounting.

## Remaining production limits

- Actual provider identities, signed fixtures, mobile GPS, checkout, delivery,
  refunds and payouts still require sandbox/staging acceptance. Mocked tests do
  not establish these. Browser GPS is evidence, not unspoofable attestation.
- Automatic hold credit and default compensation payouts remain unavailable.
  Converting a holder to a rental needs a unique credit-allocation record and
  supported merchant settlement. The UI discloses this; no credit is simulated.
- Closing a dispute report does not move money, release a reservation or claim
  a contractual completion. Operations must resolve the reservation explicitly.
- Lifecycle scheduling and email delivery need deployment acceptance. Unknown
  email outcomes remain uncertain for deliberate operator reconciliation.
- Local Supabase fixtures do not prove hosted Storage/CDN, distributed Realtime,
  production load, or an independent penetration test.
