# Rentral versioned API

Current contract: 2026-11-09. Local Next.js backend, MongoDB via Prisma 6.19.3, local JWT email/password accounts, and filesystem uploads. Supabase and mandatory KYC/profile completion are removed. Expo Android/iOS and the web app share domain services.

## Authentication and transport

Native clients use `Authorization: Bearer <access JWT>`. Web may use HttpOnly `rentral_access` and `rentral_refresh` cookies. Tokens are verified for signature/issuer/audience and bound to a current non-revoked MongoDB session and user; current `User.staff_role` controls staff actions. Access lasts 15 minutes; one-use refresh credentials rotate with compare-and-swap within a 30-day session lifetime. Passwords and refresh credentials are never returned as stored hashes.

Cookie mutations require an allowed same-origin Origin. Development additionally permits loopback browser origins for Expo web CORS; native bearer requests do not require Origin. Invalid explicit authorization never falls back to cookies. Identity-history flags do not grant permissions or prevent member access.

Success is `{success:true,data:...}`; failure is `{success:false,error:"Safe message",code:"..."}`. JSON responses are private/no-store and do not redirect to HTML sign-in. JSON bodies normally cap at 16 KiB (owner listing create has its own bounded contract); actual upload streams have separate limits.

Statuses include 400 invalid input, 401 sign-in, 403 origin/permission, 404 inaccessible resource, 409 conflict/duplicate, 413 oversized body, 415 media type, 429 rate limit, and 503 unavailable/unprepared backend. Per-process bounded read/write/auth limits are backstops, not distributed quotas.

## Account endpoints

| Method | Endpoint | Contract |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | Strict `{email,password}`; password 8–128 characters. Returns session with201. No role/actor injection. |
| POST | `/api/v1/auth/login` | Strict `{email,password}`; returns session. |
| POST | `/api/v1/auth/refresh` | Strict `{refreshToken}`; rotates once and returns replacement session. Reuse is401. |
| POST | `/api/v1/auth/logout` | Bearer access token, with captured JSON `{refreshToken}` fallback when access is expired/missing; revokes the corresponding session. Native sends both. |
| POST | `/api/v1/auth/password-reset` | `{email}`; generic development-outbox result when explicitly configured; production recovery unavailable (503). |
| POST | `/api/v1/auth/reset-password` | `{token,password}`; one-use code, changes hash and revokes old sessions/outstanding reset codes. |
| GET / DELETE | `/api/v1/auth/web-session` | Cookie account read / sign-out. Expired/missing access can rotate a valid refresh cookie. GET propagates outages (503). |
| GET | `/api/v1/me` | Account/public handle; `{id,email,username,bio,avatarUrl,accountType,memberSince,platformAvailable}`. No invented KYC evidence. |
| PATCH | `/api/v1/me` | Optional `{username,bio}`; username 3–24 lowercase letters/digits/underscores, reserved/duplicate handles denied; bio≤280. |

Session payload: `{access_token,refresh_token,token_type:"bearer",expires_in,expires_at,user}`. `user` contains public identity/role metadata, never password hashes or private session fields. Register/login JSON endpoints do not automatically establish browser cookies.

Development recovery files live under `RENTRAL_STORAGE_DIR/mail-outbox` (default `storage/mail-outbox`) and are never available through HTTP file endpoints. No OAuth callback/provider allowlist is required.

## Marketplace endpoints

| Method | Endpoint | Contract |
| --- | --- | --- |
| GET | `/api/v1/listings` |18 active listings, stable timestamp/id cursor; `{items,pagination:{limit,nextCursor}}`. Keep filters unchanged while paging. |
| GET | `/api/v1/listings/:id` | Active inventory or authenticated owner's unpublished listing, explicit public metadata allowlist. |
| GET | `/api/v1/listings/:id/media` | Owner-or-active scope; `{posterUrl,videoUrl,expiresAt}`, short-lived signed local URLs or configured signed Mux playback. |
| GET | `/api/v1/saved` | Actor's bounded saved list `{items,limit:100}`. |
| PUT / DELETE | `/api/v1/saved/:id` | Idempotent actor-scoped save/removal; `{saved}`. New saves require active inventory. |
| GET | `/api/v1/my-listings` | Explicit owner summary including drafts. |
| POST | `/api/v1/my-listings` | Strict `{mode:"draft"|"submit",listing:{...}}`; actor comes from authenticated session. Shared web/native listing service returns `{id,status}`. |
| GET / POST | `/api/v1/bookings` | Participant's recent100 / request `{listingId,kind:"inspection"|"rental"|"hold",startsAt,endsAt,...supported hold options}`; server calculates price, returns `{id}`201. |
| GET | `/api/v1/bookings/:id` | Participant-only booking; unrelated account404. Integer kobo serialized as decimal strings; dates ISO. |
| GET / POST | `/api/v1/messages` | Recent50 member conversations / `{listingId}` starts or resumes listing/seeker thread, `{id}`201. |
| GET | `/api/v1/messages/:id` | Participant-only60-message window; `hasMore`, read timestamp, `?before=<oldest UUID>` for older messages. |
| POST | `/api/v1/messages/:id` | `{clientId:"UUID",body,sharedListingId?}`; sender UUID makes retries idempotent, `{id}`201. |

Discovery filters: category house/car/boat, q, minPrice/maxPrice, intent rent/shortlet/buy/squat, state, bedrooms (0=studio), bathrooms, kitchens, transmission, seats, capacityPersons, captain=yes/no, cursor. Responses exclude raw GPS, private identity evidence, full street addresses and ownership-document paths.

Bookings, messages and saves require `RENTRAL_PLATFORM_ENABLED=true` and a prepared MongoDB. Member access does not require verification, a chosen username, or profile completion. Authentication/owner/participant/staff/publication/payment constraints remain enforced.

## Filesystem upload/download endpoints

| Method | Endpoint | Contract |
| --- | --- | --- |
| POST | `/api/v1/uploads/:bucket` | Authenticated raw bytes; actual `Content-Type`, `X-Upload-Path` actor-owned object path; returns `{path}`201. |
| GET | `/api/v1/uploads/:bucket?prefix=...&limit=...` | Owner-only prefix listing, limit≤100. |
| DELETE | `/api/v1/uploads/:bucket` | JSON `{paths:[...]}`,1–100 paths; all ownership checks precede removal. |
| GET / HEAD | `/api/v1/files/:bucket/...path?token=...` | Private file requires a short-lived purpose/bucket/path-bound JWT. Public profile avatars are the raster-only exception. |

Buckets and stream limits: `listings-media` MP4/MOV/WebM≤200 MiB or JPEG/PNG posters≤10 MiB; `compliance-docs` PDF/JPEG/PNG≤10 MiB; `profile-avatars` JPEG/PNG/WebP≤2 MiB. Media/document paths use `userId/folder/unique-file.ext`; avatars use `userId/unique-file.ext`. MIME, extension and magic bytes must agree. Paths reject traversal, alternate encodings, backslashes and reserved Windows names; links are rejected. Objects are immutable and deleted-path tombstones prevent reuse.

Private file JWTs use issuer `rentral-storage`, audience `rentral-files`, purpose/path binding and expiry≤5 minutes. An ordinary app bearer JWT or cookie does not bypass a private file signature. Obtain media URLs from the authorized listing-media endpoint; never manufacture paths or expose backend signing keys.

Single byte/suffix ranges return206; invalid or multipart ranges416. HEAD applies the same authorization and returns metadata without bytes. Private responses use no-store/nosniff/no-referrer/sandbox; ownership documents force attachment. Public avatars cache300 seconds. Email outbox, metadata files and tombstone markers are never HTTP-served.

## Client limits

Native cards link to web for host booking status changes, optional provider checkout and GPS/code inspection check-in. Existing web drafts resume on web. Recent booking/inbox windows do not expose a complete archive.

A lost booking-create or listing-submit response can leave a completed write. Refresh Bookings/My Listings before retrying; these creates are not equivalent to UUID-idempotent messages. Files are retained after ambiguous native submission failures. Payments, media processing, AI screening, payouts/refunds and publication remain separately gated and require their own acceptance.
