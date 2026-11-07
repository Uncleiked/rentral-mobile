# Rentral versioned API

Implemented 2026-11-07 as an API boundary over the existing domain services. This
does not create a native mobile application or duplicate booking/message rules.

## Authentication and transport

- Authenticate with the existing Supabase session cookies or
  `Authorization: Bearer <Supabase access token>`. Tokens are checked with
  `supabase.auth.getUser(token)`; decoded claims and editable user metadata are not
  authorization. The mobile client obtains and refreshes tokens through Supabase.
- Mutations recheck the current database KYC decision, username and completed
  individual/organization profile. These are identity account types; renters and
  hosts are contextual participants, never separate login roles.
- Cookie-authenticated mutations require an `Origin` matching
  `NEXT_PUBLIC_APP_URL`. Local development permits the actual loopback request
  origin when the configured origin is also loopback. Native bearer requests do
  not require a browser Origin. Malformed authorization never falls back to cookies.
- Success: `{ "success": true, "data": ... }`. Failure:
  `{ "success": false, "error": "Customer-readable message", "code": "..." }`.
  All responses use `Cache-Control: private, no-store`; no API error redirects to
  an HTML login page. No cross-origin browser CORS access is enabled.
- JSON bodies are streamed and capped at 16 KiB, independently of Content-Length.
  Query strings are bounded. Statuses include 400 invalid input, 401 sign-in,
  403 verification/origin, 404 inaccessible resource, 413 oversized body,
  415 wrong content type, 429 request limit, 500 unexpected failure and
  503 staged/unavailable service.
- A bounded per-process limiter permits 120 reads and 20 writes per verified
  authenticated identity per minute. This is a backstop: production ingress still
  needs distributed rate limiting and request timeouts. Multi-instance/restart
  behavior is not represented as a global quota.

## Endpoints

| Method | Endpoint | Request / result |
| --- | --- | --- |
| GET | `/api/v1/listings` | Same URL filters as `/marketplace`; 18 active listings with stable timestamp/id cursor. Result `items`, `pagination.limit`, `pagination.nextCursor`. Send the next cursor as `cursor` with unchanged filters. |
| GET | `/api/v1/listings/:id` | Public projection of active inventory or the authenticated owner's unpublished listing. Metadata has an explicit allowlist. |
| GET | `/api/v1/bookings` | Participant-scoped most recent 100 bookings, integer kobo as decimal strings, ISO timestamps, contextual role and neighborhood location. |
| POST | `/api/v1/bookings` | `{ listingId, kind: "inspection" | "rental" | "hold", startsAt, endsAt }`. ISO dates must include UTC/offset. Returns `{id}` with 201. Server calculates prices. |
| GET | `/api/v1/bookings/:id` | One participant-scoped booking. Another user's booking returns 404. |
| GET | `/api/v1/messages` | Most recent 50 member conversations with other username and latest message preview. |
| POST | `/api/v1/messages` | `{listingId}` starts or resumes the one conversation for that listing and seeker. Returns `{id}` with 201. |
| GET | `/api/v1/messages/:id` | Participant-only thread: up to 60 chronological messages, `hasMore`, and other member's read timestamp. `?before=<oldest message id>` loads older messages with stable timestamp/id ordering. |
| POST | `/api/v1/messages/:id` | `{clientId: "UUID", body, sharedListingId?}`. Client UUID makes message retries idempotent. Conversation membership and optional active listing attachment are checked by the shared service. Returns `{id}` with 201. |

Supported discovery query parameters: `category=house|car|boat`, `q`, `minPrice`,
`maxPrice`, `intent=rent|shortlet|buy|squat`, `state`, `bedrooms` (0 is studio),
`bathrooms`, `kitchens`, `transmission`, `seats`, `capacityPersons`, `captain=yes|no`
and `cursor`. Category-specific counts are exact. Metadata key `rentalIntent` backs
the URL's `intent` field. Neighborhoods are coarse; raw coordinates, full street
addresses, private identity records and compliance document paths are excluded.

## Rollout and current limits

Bookings and messaging return 503 before auth or new-table access unless
`RENTRAL_PLATFORM_ENABLED=true`. Staging migration acceptance must precede that
flag. Listing reads use existing inventory; saved-listing lookup inside discovery
is independently gated by the same flag.

Media URLs currently reference the existing authenticated browser-media routes.
Those routes require session cookies; this API does not issue long-lived media
tokens or expose original storage paths. A native client needs a cookie bridge or
a separately reviewed bearer-compatible media service before full playback.

The collection booking/inbox endpoints are bounded recent-history windows; full
archive pagination is not yet exposed. Booking status changes, hosted checkout,
check-in, read receipts, profile changes and uploads still use existing web
actions, not additional v1 mobile endpoints. Provider custody/payout acceptance
remains distinct from booking completion. A booking-create retry after an
ambiguous network failure can create another request: refresh bookings before
retrying. Payment and message idempotency do not imply request idempotency.

Source references: [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser),
[Supabase server clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client).
Guard tests cover bearer validation, current database eligibility, exact route
boundaries, cookie Origin, payload byte limits and limiter windows. They do not
prove live provider, native-client or multi-instance acceptance.
