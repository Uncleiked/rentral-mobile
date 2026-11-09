# Account closure and record export

Implemented for local JWT accounts on MongoDB. Account closure is a soft closure, not deletion of contractual history or a legal erasure guarantee. No hosted database or provider operation is performed by the tests.

## Member protocol

`POST /api/v1/account/close` accepts only `{ "currentPassword": "..." }` and returns `{ "closed": true, "signInRequired": true }` in the ordinary private/no-store envelope. It requires a live authenticated identity, the same-origin cookie mutation check (or a verified bearer), and supports `X-Rentral-Account` to reject a stale form from another signed-in account. Password proof is checked outside the retrying transaction; the password hash and email snapshot are rechecked under the user write lock. Passwords never enter audit logs, exports or persistent client storage.

`ACCOUNT_HAS_OBLIGATIONS` (409) means an ongoing booking, open booking report, pending payment instruction, pending settlement, or pending renewal/termination needs resolution. Members can cancel eligible unpaid bookings or contact support for review. Closure never guesses a refund, payout or debt discharge. Definite closed-account rejection is `ACCOUNT_UNAVAILABLE` (409), not an uncertain successful write.

Closure suspends and archives owned listings, hides the public handle/bio/avatar, clears staff roles, disables matching and bank recipients, removes saved items and mapped consent-based analytics, revokes sessions and cancels password/email-change capabilities. It retains the user identity privately, email uniqueness, existing bookings/payments/journals/reviews/reports and needed evidence. It does not delete uploaded evidence or financial history. Closed accounts cannot sign in, refresh access, recover a password, confirm an email change, publish, book, start checkout or send new messages. Staff can still review owed refunds and historical evidence. There is no automatic reactivation endpoint.

## Atomic availability boundary

`assertActiveAccounts(tx, ids)` sorts and deduplicates IDs and increments each User revision with an active-account predicate on the write itself. Missing legacy `closed_at` and explicit null are active; a closure date is inactive. The close transaction holds the same user write anchor while checking obligations and hiding assets. Listing creation/editing, bookings/acceptance/check-in, checkout, new messages, matching and lifecycle commitments use this boundary. Publication also requires an active owner. The real Mongo fixture races actual draft saving and booking creation against closure. A completed listing creation can be hidden atomically by closure; an established booking instead blocks closure.

Future reads exclude closed owners from public profiles, discovery and new media capabilities. Avatar requests check active ownership and use private/no-store. Previously downloaded copies, already cached third-party copies, and existing short-lived media capabilities cannot be recalled. No instant erasure claim is made.

## Paged JSON export

`GET /api/v1/account/export` returns a version-1 manifest. With `?resource=<name>&limit=100&cursor=<UUID>` it returns `{ version:1, resource, generatedAt, items, nextCursor }`. The limit is 1–100 (default50), resource names are strict, UUID keyset cursors order ascending by ID, and each request performs a bounded query. Responses are private/no-store JSON attachments. Each page is a current view, not a multi-page database snapshot; concurrent edits can appear on later requests. Download before closure, because closure revokes access.

The core resources are profile, listings, bookings, payments, financial operations, authored messages, notifications, authored reviews, opened reports, saved listings and consent settings. Each has an explicit field allowlist. Password hashes, refresh/reset/confirmation hashes, live capabilities, handshake codes, raw listing GPS, provider payloads, full bank details and another sender’s private message body/evidence are excluded. Uploaded binaries and internal operator review notes are not included. Kobo amounts are decimal strings. Optional unprepared financial features return an empty financial page instead of creating collections.

Web profile controls download one resource page at a time and require current-password proof plus explicit acknowledgement for closure. They send the rendered account guard. A lost closure acknowledgement is not retried automatically; refresh account status before another action.

## Verification

Dedicated unit tests cover sorted conditional writes, missing/closed users, stale credential snapshots, each obligation blocker, soft-closure side effects, optional feature readiness and bounded export scope. The owned replica fixture additionally checks retained history and revoked sign-in/challenges, explicit cancellation before closure, real create-versus-close races, and own-message pagination/privacy. Browser security acceptance is tracked separately; a source/unit pass is not a browser acceptance result.

## Retention

Analytics retains its existing 90-day policy and supports mapped-history withdrawal. Expired or accepted encrypted authentication messages purge ciphertext while metadata remains. Closure keeps financial, booking and evidence records pending an operator-approved retention schedule; there is no blanket TTL on User, ledger, receipts, disputes or storage claims. The operator must define retention and legal holds before any additional destructive cleanup. See [backup and recovery proposal](backup-retention.md).
