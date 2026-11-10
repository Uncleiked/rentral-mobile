# Recording location, address admission and Rentral branding

Status: explicitly approved by the user, 2026-11-10; source and local verification
complete. Final build, eight production browser journeys and 1,792 unit checks
passed. Backend/Metro/Atlas runtime handback passed. The delivery revision is
recorded in Git history; remote verification belongs to the final handback.
See the [review](capture-location-brand-review.md) and
[progress](progress-tracker.md). Device/provider release acceptance is separate.
Earlier completion evidence describes the prior revision.

## What we are building

Bind a walkthrough recording to a private, server-persisted device location at
recording time. Resolve the entered address on the backend and prevent submission
when it is inconsistent with that location or cannot be verified precisely.
Introduce a minimalist Rentral mark, consistent app/web assets and a brief,
accessible native launch reveal. Retain MongoDB/JWT, npm, no personal KYC and
Paystack only.

## Approved language and decisions

- Recording location: a fresh foreground GPS reading from the recording device,
  accepted and timestamped by the server before the app starts the camera take;
  checked again around completion. This is device-reported evidence, not a
  tamper-proof hardware attestation or proof of property ownership.
- Locked: the backend preserves the accepted capture record; ordinary listing
  metadata/address updates cannot rewrite it. A replacement video requires a new
  capture, and the uploaded video is bound to its exact capture record.
- Address match: the backend resolves the entered address with Geoapify, requires
  a sufficiently precise Nigerian building/amenity result and compares it with
  the private recording location. Keep the existing 100-metre maximum distance.
  City/street centroids, unavailable geocoding and mismatches do not pass.
- Posting: submitting a listing for review, not only final staff publication.
  Draft text may be saved before a match, but submission is blocked. Existing
  independent document/payment/publication review remains required.
- Brand: a simple geometric doorway/lowercase-r monogram using Rentral's emerald
  and dark semantic palette, plus a restrained wordmark. Reuse the same geometry
  for mobile/web/logo/icon/splash assets.
- Opening animation: a brief, single launch reveal after the operating system
  splash; no looping or waiting for the backend. Respect reduced motion, retain
  error/loading navigation, and do not replay on every screen or foreground event.

## Existing behavior and gap

MongoDB replaced the historical PostgreSQL/PostGIS stack at the user's direction.
The current implementation has private GeoJSON ListingLocation geometry,
2dsphere indexing, WGS84 distance checks and a 100-metre Geoapify comparison.
Final staff publication already requires a match against the current address hash.

Native capture currently gets a GPS fix before recording, but sends coordinates
later as mutable draft data. There is no server-acknowledged capture session and
owner submission does not run address verification. Those gaps are this increment's
primary backend/client changes. No second PostgreSQL database is needed.

## How to build it

1. Add an owner/session-bound capture lifecycle and private immutable GPS evidence.
   Bound freshness, reported accuracy, recording time and finalization; reject
   mocked readings where the platform supplies that signal. Handle interrupted
   and uncertain commands through readback rather than blind retries.
2. Bind the capture identity to the actual validated uploaded video/claim. Prevent
   a different video, owner, draft or stale/replaced capture from reusing its lock.
   Preserve legacy drafts/data; require a new take where old evidence cannot meet
   the new recording-time rule rather than inventing a lock for it.
3. Extract/reuse server geocoding policy for address preflight and final admission.
   Recheck the current address fingerprint and capture under write locks after
   provider I/O, so concurrent address/capture changes cannot bypass validation.
   Do not send exact GPS in public DTOs or run provider calls in transaction retries.
4. Update native capture, draft recovery and address form with clear recording,
   checking, matched, mismatch, insufficient-GPS and provider-unavailable states.
   Apply the same backend admission rule to other submission paths.
5. Create reusable vector brand source, derived native icon/splash assets and
   consistent web/native logo placements; implement the bounded accessible launch
   animation using the installed Expo-compatible motion stack.
6. Verify meaningful success, denial, stale/unknown/replay and concurrency cases
   using unit tests and owned disposable Mongo/browser fixtures. Run affected type,
   lint, production-build and Android/iOS export checks. Real camera/GPS permissions,
   capture interruptions and launch appearance still require a physical device.
7. Update architecture/API/environment documentation, progress and UI registries.
   Document step-by-step Geoapify setup and any explicit additive Mongo preparation;
   never put provider secrets in EXPO_PUBLIC variables or reset existing data.

## Environment and external boundaries

Geoapify uses the existing backend-only GEOAPIFY_API_KEY. Inspect only whether the
key is configured, never expose its value. Logo/launch motion should need no secret.
If capture persistence changes the schema/readiness contract, provide and verify
the existing additive setup workflow against owned fixtures before any configured
Atlas preparation. Atlas's changing-IP access issue is an independent prerequisite
for testing the hosted backend. No live provider calls/charges, deployment, store
submission, original PostgreSQL writes, or historical-data deletion are part of
this increment.
