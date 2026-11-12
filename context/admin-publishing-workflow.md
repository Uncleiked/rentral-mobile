# Admin publishing and owner drafts

Updated: 2026-11-12. Active project: RentralMobile, npm, MongoDB/Prisma, local JWT.
This specification supersedes older statements requiring human approval for every
listing. It does not change personal KYC or payment-provider activation policy.

## Accepted decisions

All admitted members may save partial private drafts after selecting a category,
including members without gallery permission. Gallery upload access, free posting
and direct publishing are independent, administrator-issued capabilities. Turning
on one never grants the others. An active recording must be stopped/sealed before
it can be saved as completed media; browser recovery is not a saved server draft.

Direct publishing bypasses independent human document approval. Required listing
fields, authority documents, immutable owned media, current account/organization
admission, recorded capture/address evidence (unless gallery-exempt), video readiness
and actual publication-fee payment or explicit waiver remain mandatory. It does not
certify ownership or automatically approve DocumentReview. Public detail pages
explain the publication method. Gallery content retains its unverified-location label.

## Administrator workflow

1. Open /admin and choose Members. Find a member by email or username.
2. Select the member and choose the relevant permission decision: gallery uploads,
   free posting or direct publishing. Set its switch, enter the review reason and
   choose Record decision. Changes are not saved merely by toggling the switch.
3. The platform owner must explicitly acknowledge a detailed reason for their own
   access changes. Other administrators cannot change their own access or the
   protected owner. Existing role capabilities stay unchanged; finance does not
   acquire publishing powers.
4. Choose View listings to open all submitted inventory for that member. The global
   listing queue also searches host email, username, title, address and listing ID.
5. Awaiting review excludes private drafts and trusted submissions awaiting media or
   payment. Choose All submitted listings or Pending verification to find those
   records. Category, media source, fee, archive and sort filters apply on the server.
6. Open a listing to view its publication checklist and on-demand media preview.
   Private document approval always binds the actual current document digest.
   Ordinary admin Publish requires that independent approval, including owner review
   with the existing explicit override. Direct publishers use their owner workflow.
7. Per-listing Waive fee and Revoke waiver remain separate from future account grants.
8. Export matching listings downloads a CSV under the current filters across pages.
   Exports stop at 1,000 rows and explicitly report truncation; narrow filters to
   obtain complete smaller slices. They exclude raw identity, document paths,
   hardware coordinates, bank details and host email. Recent overview counts are
   labelled as samples of up to 50; the queue supplies the full matched count.

## Owner workflow

The creation wizard and gallery workspace expose Save draft and Save and exit near
the top, including incomplete forms. A selected category is the minimum. The page
separates unsaved changes, browser request recovery and a confirmed server save.
Refresh/exit warnings protect unsaved changes. Current unconfirmed instructions are
retained for exact receipt readback/retry rather than silently creating duplicates.

Your listings provides All listings, Drafts, Submitted, Live, Needs attention and
Archived filters with local title/category/ID search. Draft cards resume the correct
recording/gallery workflow. Confirmed submission keeps the same row and moves it
out of Drafts, with a saved confirmation and its factual current status. Photo-only
gallery listings use their actual photos and custom titles rather than video-only
placeholders or generic names.

A trusted, fee-waived photo listing can go live during its validated submission.
A trusted listing waiting for fee payment or video processing stays saved as
pending_verification with trusted_publisher intent, outside the human review queue.
After requirements are complete, open the listing and choose Finish publishing.
That owner command has a revision check, idempotent receipt and exact readback/retry.
No unverified browser redirect or provider response can manufacture fee success.

## Enforcement and data model

Optional User grant fields record allowed, issuer, timestamp and reason. Legacy
missing fields confer no extra authority. Optional Listing publication_mode and
proof bind direct intent to the exact owner, grant and document path/digest.
No hosted setup/reset is required by this source change and none was run.

Free posting is stamped as a factual existing per-listing waiver only at a new,
validated submission. Enabling it later does not waive old submissions; use their
individual waiver action. Removing it preserves historical waivers and payments.

Removing direct permission moves nonarchived active/pending direct listings to
manual review without republishing suspended/archived records. Explicit listing
suspension/rejected documents clear direct mode. Account suspension removes all
three privileges, revokes sessions and suspends live inventory; restoration does
not manufacture prior approval. Repeated same-state grants preserve proof identity.

All decisions use current staff permissions, transaction locks, expected revision,
audited reasons and original-command receipts. Plain member input cannot grant a
capability or inject owner IDs. Listing search uses a fixed read-only escaped
aggregation; no user-provided Mongo operators or new hosted indexes are installed.
Signed reviewer media links last 60 seconds and bind immutable owned objects.

## Verification and operational limits

Unit/service tests cover grants, exact payments, independent review, trusted intent,
revocation, organization admission, ownership, revision races and receipt replay.
Synthetic browser suites use real components plus loopback-only mock transports;
they never load private env files or write hosted data. Owned-Mongo tests remain
opt-in with an ownership guard. Docker is unavailable on this machine; those
integration tests must run on a working local replica-set fixture before treating
this as database-backed deployment acceptance. Provider and native device tests
are not implied. Production changes require a normal deployment.

See progress-tracker.md and admin-workflow-review.md for final verification counts.
