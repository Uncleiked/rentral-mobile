# Rentral versioned API

Current source contracts, 2026-11-09: local Next.js, MongoDB/Prisma 6.19.3, JWT
email/password accounts and private filesystem storage. Expo Android/iOS and web
share server domain services; no personal KYC/profile-completion gate applies.
**The native publication-fee addition is implemented and locally verified.**
Current aggregate, export, browser and real HTTP evidence is recorded separately
from actual-provider/device acceptance.
See [current status](completion-status.md) and [Paystack](paystack-integration.md).

## Authentication, transport and recovery

Native uses `Authorization: Bearer <access JWT>`; web can use HttpOnly
`rentral_access`/`rentral_refresh` cookies. Access lasts 15 minutes and requires
a current non-revoked Mongo session and active account. Refresh hashes rotate
once with compare-and-swap within the 30-day session lifetime. Current database
roles/ownership/participants control authorization, not editable identity flags.

Cookie mutations require an allowed same-origin Origin; development permits
supported loopback Expo-web origins. Invalid explicit bearer credentials never
fall back to cookies. `X-Rentral-Account: <captured actor UUID>` is an additional
restriction: mismatch returns `409 ACCOUNT_CHANGED`, never grants access. Native
commands bind their expected actor before/after awaits and across durable recovery.

Success is `{success:true,data:...}`; failures have `{success:false,error,code}`.
JSON is private/no-store and never redirects to HTML sign-in. Standard JSON
bodies are bounded (normally 16 KiB); route-specific schemas/stream limits apply.
Common statuses: 400 validation, 401 sign-in, 403 permission/origin, 404 inaccessible
resource, 409 conflict/account/environment change, 413 size, 415 type, 429 rate,
503 disabled/unprepared/unknown outcome. A 503/timeout can follow a committed
write. Never infer rejection or automatically generate a new payment/create command.

## Native owner publication fee

All three routes use `/api/v1/my-listings/:id/publication-fee` and require the
authenticated owner of that exact listing. No request accepts actor, amount,
currency, provider mode, arbitrary checkout URL or payment ID overrides.

| Method | Suffix | Strict input and result |
| --- | --- | --- |
| GET | none | Own fee overview, readable even while payments are disabled. |
| POST | `/checkout` | `{}`; returns `{paymentId,reference,environment,url}` after fresh persisted intent/URL/listing/mode binding. |
| POST | `/reconcile` | `{reference}`; verifies that exact owner/listing fee intent and current mode, polls existing provider truth, returns refreshed overview. |

Pure schemas are in [listing-payments.ts](../lib/contracts/listing-payments.ts).
The fixed `PUBLICATION_FEE_KOBO='100000'` is **NGN 1,000 server policy**, shared with
the native display. It is not a client-selected amount or an environment price.
The overview contains `listingId`, `listingStatus`, `archived`, `currency`,
`amountKobo`, `paymentAvailable`, configured `environment` (nullable), nullable
`payment` history and `actions:{checkout,reconcile}`. A payment records its own
`id,reference,status,environment,amountKobo,currency,createdAt,paidAt`. Historical
mode is displayed truthfully; it is not current-mode publication proof.

The native owner screen persists actor/listing-scoped recovery before a mutation,
retains unknown outcomes across interruption and never automatically replays a
POST. Refresh overview after ambiguous checkout, reconcile the existing reference,
and only open the exact returned Paystack HTTPS URL after fresh response/readback
binding. Do not substitute whichever payment is now latest. A redirect or browser
close proves nothing. Missing/replaced/mode-changed references stay blocked for
review; changing accounts never reuses another actor's pending command.

Only a submitted `pending_verification`, unarchived listing can prepare checkout;
the admission check repeats under the listing lock and accepts Mongo null/missing
archive fields. The configured callback is validated before intent writes. Current-
mode created/pending attempts are reused; initializing/uncertain/review/success/
reversed attempts do not create a new charge. Explicit new attempts require a
known failed/abandoned terminal record with known provider mode. Active or legacy
unknown-mode mismatches fail closed. Fee receipt proof for **new publication
approval** must match the current environment; existing public assets are not
withdrawn merely because provider settings changed.

`PAYMENTS_ENABLED=false`, missing credentials or invalid callback configuration
make checkout unavailable (safe 503/action flags), while history remains readable.
No provider activation occurred. New API/native controls passed the final local
verification recorded in [final review](final-review.md); real provider acceptance
remains separate.

## Accounts, security and lifecycle

All paths below start with `/api/v1`.

| Method | Path | Purpose / strict contract |
| --- | --- | --- |
| POST | `/auth/register`, `/auth/login` | `{email,password}`; register 201, passwords 8–128 chars; returns session, no stored hash/role injection. |
| POST | `/auth/refresh` | `{refreshToken}`; one-use rotation, reuse 401. |
| POST | `/auth/logout` | Captured signed access proof and `{refreshToken}` fallback revoke the same SID. Bounded expired proof is revocation-only, never authentication. Unconfirmed legacy logout returns 409, not false success. |
| GET / DELETE | `/auth/web-session` | Cookie session read / logout; outage 503, unconfirmed logout does not falsely clear acknowledged server state. |
| POST | `/auth/password-reset`, `/auth/reset-password` | Generic request `{email}`; one-use `{token,password}`. Enabled Resend or private opt-in dev outbox; tokens stay private. |
| GET | `/auth/account`, `/auth/sessions` | Security/email-change state and bounded own session history. |
| POST | `/auth/password` | `{currentPassword,newPassword}`; credential snapshot rechecked under User lock, sessions/capabilities/push revoked. |
| DELETE | `/auth/sessions`, `/auth/sessions/:id` | Revoke all / owned SID and corresponding prepared push registrations. |
| POST / DELETE | `/auth/email-change` | Request `{newEmail,currentPassword}` / cancel pending change. |
| POST | `/auth/email-change/confirm` | `{token}`; independent old/new-mailbox confirmation, `waiting` or `completed`; completion revokes sessions. |
| GET / PATCH | `/me` | Own profile/bootstrap / optional `{username,bio,avatarUrl}`; avatar is an owned validated local public raster reference or null, never an arbitrary remote URL. |
| POST | `/account/close` | `{currentPassword}`; soft closure blocks open obligations, revokes public participation/access, retains owed history/evidence. |
| GET | `/account/export` | Allowlisted manifest or `{resource,cursor,limit}` query; limit 1–100, default 50. No credentials/GPS/other parties' private evidence. |
| GET | `/dashboard` | Actual own counts/history/derived metrics; incomplete samples stay null. |

Session result is `{access_token,refresh_token,token_type,expires_in,expires_at,user}`.
Register/login JSON does not establish browser cookies. Password/session/email
schemas: [account-security](../lib/contracts/account-security.ts); closure/export:
[account-lifecycle](../lib/contracts/account-lifecycle.ts). Dev mail files under
`RENTRAL_STORAGE_DIR/mail-outbox` are never available through file routes.

## Discovery, profiles, owner inventory and files

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/listings`, `/listings/:id`, `/listings/:id/media` | Filtered discovery with stable cursors, current detail scope and short-lived authorized media URLs. |
| GET | `/profiles/:username`, `/profiles/:username/listings`, `/profiles/:username/reviews` | Bounded public host/review/listing projections; closed owners excluded. |
| GET | `/saved` | Own bounded saved listings. |
| PUT / DELETE | `/saved/:id` | Idempotent own save/remove; new saves require active listing. |
| GET / POST | `/my-listings` | Cursor owner inventory / strict `{mode:'draft'|'submit',listing:...}` shared listing schema. |
| GET / PATCH | `/my-listings/:id` | Private owner detail / `{operation:'update',listing:...}` or `{operation:'archive',archived}`. |
| GET | `/my-listings/:id/document`, `/vault` | Authorized own private document capability / bounded draft vault. |
| POST | `/uploads/:bucket` | Raw body, truthful Content-Type and owner `X-Upload-Path`; returns `{path}` 201. |
| GET / DELETE | `/uploads/:bucket` | Owner prefix list / `{paths:[...]}`, 1–100 owned paths, referenced objects protected. |
| GET | `/uploads/:bucket/info` | Owner-scoped actual object metadata verification. |
| GET / HEAD | `/files/:bucket/...path?token=...` | Purpose/bucket/path-bound private capability; public raster avatars remain active-owner checked. |

Filters include category, q, budget, intent, state/neighborhood and property/car/
boat parameters; keep filters unchanged while paging. Coordinates and private
supporting evidence never enter public projections. Device saved searches are
local actor-scoped preferences, not a server alert subscription.

Upload limits: video MP4/MOV/WebM 200 MiB; posters JPEG/PNG 10 MiB; compliance
PDF/JPEG/PNG 10 MiB; avatar JPEG/PNG/WebP 2 MiB. MIME/extension/magic/ownership/path/
link checks and durable attach/delete claims apply. Private capability expiry is
at most 5 minutes; app bearer/cookie does not bypass it. GET supports a single
byte/suffix range (206; invalid/multipart 416); HEAD applies the same authorization.
Responses are private/no-store/nosniff; documents force attachment. Mail outboxes,
metadata and deletion tombstones are never served. Deleted object paths cannot
be reused. See [storage policy](../lib/local-storage/policy.ts).

## Bookings, feedback, messaging and notifications

| Method | Path | Purpose |
| --- | --- | --- |
| GET / POST | `/bookings` | Participant history / strict server-priced request, preserving original client command UUID/content. |
| POST | `/bookings/quote` | Server-authoritative date/period/fee/credit quote. |
| GET | `/bookings/active-hold`, `/bookings/:id` | Own effective hold / participant detail with actions and exact kobo strings. |
| PATCH | `/bookings/:id` | Authorized host/member status decision, including supported hold conversion. |
| POST | `/bookings/:id/handshake-code`, `/bookings/:id/check-in` | Participant code and supported precise GPS/code handshake. |
| POST | `/bookings/:id/checkout`, `/bookings/:id/reconcile` | Empty checkout body / exact saved payment reference readback; same collection-mode/uncertainty guards apply. |
| GET | `/bookings/:id/feedback` | Participant feedback/report context/history. |
| POST | `/bookings/:id/review`, `/bookings/:id/reports` | Booking-linked eligible review / private participant report. |
| GET / POST | `/messages` | Cursor inbox/unread / `{listingId}` starts or resumes authorized conversation. |
| GET / POST | `/messages/:id` | Participant message window / `{clientId,body,sharedListingId?}`; altered same nonce is rejected. |
| POST | `/messages/:id/read` | Optional displayed `messageId`; monotonic read state without inbox reorder. |
| GET / POST / DELETE | `/messages/:id/activity` | Participant coarse presence/typing, foreground opt-in updates / withdrawal. |
| GET | `/notifications`, `/safety/notices` | Own cursor notifications / affected-member reviewed notices. |
| PATCH | `/notifications/:id/read` | Own monotonic read state. |
| POST | `/safety/notices/:id/appeal` | Affected-member private appeal. |

Native booking status/quote/check-in/checkout and owner draft/edit/vault operations
are direct supported workflows; ordinary actions do not require a web handoff.
Provider-hosted checkout remains an explicit browser step. Listing/booking creates
use server mutation receipts for supported UUID commands; after an unknown result,
read back the original command/resource rather than inventing a new nonce. Polling
and reconnect provide current messages/activity; no Supabase Realtime dependency.

## Leases, matching, privacy and push

| Method | Path | Purpose |
| --- | --- | --- |
| GET / POST | `/renewals`, `/terminations` | Own cursor requests / evidence-backed proposal. |
| GET / PATCH | `/renewals/:id`, `/terminations/:id` | Participant history / allowed counterpart decisions. |
| GET | `/renewals/:id/evidence`, `/terminations/:id/evidence` | Authorized participant/staff private evidence capability. |
| GET | `/squat-mates` | Opt-in explainable candidate discovery. |
| GET / PUT / DELETE | `/squat-mates/profile` | Own preferences/current account state / save / withdraw. |
| GET / POST | `/squat-mates/connections` | Own cursor contacts / request with durable command. |
| GET / PATCH | `/squat-mates/connections/:id` | Current mutual-contact view / allowed contact decision. |
| GET / POST | `/squat-mates/connections/:id/messages` | Authorized contact history / nonce-bound message. |
| POST | `/squat-mates/connections/:id/read` | Monotonic displayed-message read state. |
| GET | `/squat-mates/connections/:id/report-context`, `/squat-mates/blocks` | Narrow reporting context / own blocks. |
| PUT / DELETE | `/squat-mates/blocks/:id` | Own block/unblock. |
| GET / POST | `/squat-mates/reports` | Own private report history / supported contact report. |
| GET / PATCH | `/privacy/analytics` | Current persisted consent / explicit preference update. |
| DELETE / POST | `/privacy/analytics/history` (DELETE), `/privacy/analytics/events` (POST) | Withdraw mapped history / validated coarse consented observation; public events cannot assert verified booking. |
| GET | `/push`, `/push/devices` | Prepared capability/consent state / own device status. |
| POST | `/push/devices` | Current-SID/consent-version-bound encrypted registration, installation proof and provider token. |
| DELETE | `/push/devices/:id`, `/push/installation` | Revoke owned registration / captured installation; stale enrollment cannot undo opt-out/logout. |

Schemas: [lifecycle](../lib/contracts/lifecycle.ts), [matching](../lib/matching/contracts.ts),
[push](../lib/push/policy.ts). Withdrawal/report/redress retain narrow history even
where new participation is blocked. Push requires configured EAS/platform credentials
and a development/store device build; browser fixtures do not prove delivery.

## Financial, commercial and staff groups

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/financial?scope=member|staff` | Actor-scoped history/actions; staff permission checked, no secret required just to read saved history. |
| GET | `/financial/payments/:id`, `/financial/banks` | Own payment/refund context / configured recipient bank list. |
| POST / DELETE | `/financial/recipients` (POST), `/financial/recipients/:id` (DELETE) | Resolve/create own recipient / disable; account details transient, public DTO only last four digits. |
| POST | `/financial/operations` | Strict durable refund/payout request; amount/source budget server-validated. |
| POST | `/financial/operations/:id` | `approve`, `reject`, `execute`, `reconcile`, `finalize`, `retryRefund`; permission/independence/state gates per action. |
| POST | `/financial/receipts/:id` | Staff authenticated-receipt recovery. |
| GET | `/commercial`, `/commercial/orders/:id` | Own purchase/history/access state / exact order. |
| POST / PATCH | `/commercial/orders` (POST), `/commercial/orders/:id` (PATCH) | Durable manual-term order / allowed owner decision. |
| POST | `/commercial/orders/:id/checkout`, `/commercial/orders/:id/reconcile` | Immutable order/amount/current-mode payment and exact reference readback. |
| GET / POST | `/commercial/campaigns` | Own cursor campaigns / draft. |
| GET / PATCH | `/commercial/campaigns/:id` | Own campaign / supported draft/review request/pause change. |
| GET | `/commercial/campaigns/:id/metrics`, `/insights` | Own bounded campaign metrics / entitled thresholded consented report. |
| GET / POST | `/sponsored` (GET), `/sponsored/:id/events` (POST) | Current filtered labeled placement / coarse validated view/click, not payment proof. |
| GET | `/staff/lifecycle`, `/staff/matching`, `/staff/campaigns` | Current-role queues with bounded pagination. |
| PATCH | `/staff/lifecycle/renewals/:id`, `/staff/lifecycle/terminations/:id`, `/staff/lifecycle/failures/:id` | Independent reviewed decision / explicit incident handling. |
| POST | `/staff/lifecycle/notifications/:id/reconcile` | Privileged unknown-email acceptance recovery. |
| PATCH / POST | `/staff/matching/reports/:id` (PATCH), `/staff/matching/profiles/:id/restore` (POST) | Independent restriction/restoration; no hidden profile disclosure. |
| PATCH | `/staff/campaigns/:id` | Independent campaign approval/reject/pause. |

Pure contracts: [financial](../lib/contracts/financial.ts),
[commercial](../lib/commerce/contracts.ts). Scope/actions are UI hints, never a
substitute for transactional authorization. Money is integer kobo strings; dates
are ISO. Collection does not imply custody, completed payout or recurring billing.
New financial execution requires explicit provider/policy gates and current keys.
Unknown outcomes retain source reservations and are reconciled, not blindly retried.

Feature markers and enable flags remain required. Staff/institutional web views
share these services; no native staff role escalation exists. See
[environment setup](environment-setup.md), [matching](matching.md),
[commercial](commercial.md), [account security](account-security.md), and
[push operations](push-operations.md) for the remaining device/provider boundaries.
