# Account security and email delivery

Updated 2026-11-09. JWT accounts remain independent of personal KYC, profile
completion and external OAuth. Existing accounts, uploads and financial records
are preserved. No actual email was sent during implementation acceptance.

## Member operations

Profile account security now supports current-password changes, active-session
history/revocation and a dual-mailbox email change. A public `/confirm-email`
form accepts confirmation codes through JSON POST, not URL query parameters.
The native client uses the same versioned contracts in
`lib/contracts/account-security.ts`.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/v1/auth/account` | Current address, configured delivery mode and the member's pending change |
| `POST /api/v1/auth/password` | Current-password proof, new hash, invalidate challenges and revoke all sessions |
| `GET /api/v1/auth/sessions` | Paged active sessions, current-session label, no tokens/hashes/IP data |
| `DELETE /api/v1/auth/sessions/{id}` | Revoke only a session owned by the current account |
| `DELETE /api/v1/auth/sessions` | Revoke all current sessions and require sign-in again |
| `POST /api/v1/auth/email-change` | Current-password proof and separately generated codes for current/new inboxes |
| `DELETE /api/v1/auth/email-change` | Cancel the current account's pending change and purge queued capabilities |
| `POST /api/v1/auth/email-change/confirm` | One-use capability; both separate confirmations are required before changing the address |

Cookie-authenticated writes retain Origin enforcement; bearer requests are
validated against live sessions. The optional `X-Rentral-Account` header can only
restrict the expected actor: a stale form after another tab signs into a different
account receives `409 ACCOUNT_CHANGED`. It never grants authentication. Profile
security forms send the server-rendered actor ID and remount when that actor
changes. Private responses remain uncacheable.

Password proof runs outside transaction retries. The service then rechecks the
same password-hash and email snapshot under the User revision lock. Old-email
login snapshots cannot create a session after the address changes. Session
creation, password change, reset and mailbox confirmation serialize through that
same account lock.

## Confirmation and recovery

Mailbox codes are independent random 256-bit capabilities, valid for 15 minutes.
Only SHA-256 hashes enter `EmailChange`/`PasswordReset`; raw values appear only in
authorized email content or the explicitly enabled private developer mailbox.
Confirmation checks the original address and a fingerprint of the credential
snapshot. Password changes/resets invalidate older requests even when another
server briefly retains an older feature-readiness cache.

Both inboxes must confirm before `User.email` changes. Repeated/expired/cancelled
codes fail; a racing destination registration leaves the original address intact.
Completing the change revokes all sessions and reset codes. The process follows
[OWASP's guidance for email changes without MFA](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#recommended-process-if-the-user-does-not-have-multifactor-authentication-enabled).

Recovery validates global configuration before looking up an email address.
Known and unknown addresses receive identical acknowledgement shapes; private
delivery-preparation/provider outcomes are not returned as an existence oracle.
Actual email is queued independently of the public response. Email addresses and
codes are never included in ordinary notifications, provider errors or public DTOs.

## Encrypted delivery and activation

Real delivery requires all of:

- `AUTH_EMAIL_ENABLED=true`.
- `RESEND_API_KEY` with permission to send from the verified sender.
- `RENTRAL_EMAIL_FROM`, for example `Rentral <mail@example.com>`.
- `AUTH_EMAIL_ENCRYPTION_KEY`: 32 random bytes encoded as unpadded base64url
  (43 characters), dedicated to this outbox.
- Reviewed Mongo preparation with the `authSecurityVersion` feature marker.
- A running guarded local worker that processes the auth-email job.

`AuthEmailDelivery` stores a bounded AES-256-GCM envelope. Its authenticated data
binds the job UUID and purpose. Neither another job nor another purpose can reuse
its ciphertext. The optional `AUTH_EMAIL_ENCRYPTION_PREVIOUS_KEY` supports reading
already queued jobs while rotating the current key. Preserve the keys until their
jobs are sent or expired; do not replace ciphertext with unauthenticated plaintext.

The transport uses the fixed Resend HTTPS origin, disallows redirects, bounds
responses and has a 10-second deadline. Its fixed idempotency key is
`rentral-auth:{deliveryId}`, with an unchanged payload. Resend documents a
24-hour key lifetime; retries stop at capability expiry and are additionally
bounded below that provider window. See
[Resend's send-email contract](https://resend.com/docs/api-reference/emails/send-email)
and [idempotency guarantees](https://resend.com/docs/dashboard/emails/idempotency-keys).

Workers claim durable leases, recover interrupted sends and quarantine exhausted
or definitively rejected jobs. Unknown acknowledgements retain encrypted content
for a safe same-key retry. Accepted or expired jobs clear ciphertext while keeping
delivery metadata. Cancelling a change/reset also invalidates its queued content.
No raw provider response, code or recipient address is copied into worker errors.

When real delivery is disabled, `AUTH_DEV_EMAIL_OUTBOX=true` permits the existing
local operator workflow only outside production. Its files live under the private
storage root's `mail-outbox`; API upload/file routes deny that location. No personal
code or private filesystem path is shown to ordinary members. This mode does not
claim that an email was sent.

## Acceptance evidence and limits

Controlled checks cover authenticated encryption/substitution/rotation, strict
Resend transport, safe errors, public capability and authenticated settings APIs,
actor changes and stale credential snapshots. Thirteen actual owned Mongo cases
cover dual confirmation ordering/races, expiry/replacement/cancellation,
destination uniqueness rollback, session scoping/revocation, reset invalidation,
encrypted queue persistence, accepted-payload purge, lost acknowledgement with
same-key recovery and the private development mailbox. The fixture never uses
the application's Atlas namespace, real recipients or live provider calls.

Real sender-domain acceptance remains required before activation. SMS/MFA and
external provider deployments remain separate operator work. [Account closure
and export](account-lifecycle.md) now have their own guarded services; neither
this source nor mocked provider acceptance activates real delivery.

## Device and logout revocation

When push storage is prepared, a password change/reset, completed dual-mailbox
email change or all-session revoke also revokes push devices in the same User-
locked transaction. Sending need not be enabled to revoke a device. Ciphertext
is cleared, pending sends are skipped and already-submitting sends remain
uncertain rather than falsely claiming external cancellation. A targeted logout
or session revoke affects only device bindings for that owned SID. Enrollment
rechecks the captured live SID and private consent version under the same lock.

JWT authentication still expires after15minutes and checks a live database
session. The HttpOnly cookie can retain the signed token for at most30days solely
as a same-SID logout proof. A separate strict verifier checks signature/algorithm,
issuer/audience/type, UUID subject/SID and issued/expiry bounds. It can revoke
the proved session after an opaque refresh rotation; it cannot authenticate,
refresh, authorize a route or mint a new token. Expired, future, long-lived,
malformed and file-purpose proof tests enforce that distinction.

If only an already-consumed legacy opaque refresh capability remains, logout
returns409 `LOGOUT_UNCONFIRMED` and the web adapter retains cookies. Refresh
account status and explicitly retry; it never claims server revocation from an
unresolved result. Native local-erasure behavior is documented by its separate
session UI and does not imply that an unavailable server acknowledged revocation.
