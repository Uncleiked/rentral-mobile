# Recording location, branding and recovery review

Reviewed 2026-11-10 against the [approved blueprint](capture-location-brand-blueprint.md),
[architecture](architecture.md), UI registries and code standards. Source and
local verification are complete. Physical-device, provider and release acceptance
are separate. The whole-app baseline was delivered as `6f2af2f`.

## Layer 1 — Plan alignment: PASS

- Recording waits for backend acknowledgment of a fresh private device location.
  `ListingCapture` preserves server times, bounded start/end readings, owner/
  session binding and one-way recording/recorded/sealed transitions. The actual
  completed upload and digest bind to one capture/listing.
- Contracts accept capture identity rather than mutable coordinates. The server
  requires a sufficiently confident Nigerian building/amenity result within
  100 metres. Unavailable, imprecise or mismatched results block submission;
  staff publication independently requires exact current proof. Address edits
  cannot rewrite the accepted recording point.
- Native/web provide capture/address states and owner-scoped readback for
  uncertain outcomes. Existing drafts remain; an old unverified video needs a
  new take. Web request identity is persisted per actor before mutation, and
  delayed responses cannot update another wizard. Refresh without the retained
  video reports the need to recapture rather than inventing evidence.
- One emerald doorway/r geometry generates shared vector, favicon and native
  assets. Launch is brief, reduced-motion aware, bounded and free of a backend
  wait. Next's favicon decoder now receives RGBA embedded PNG data.
- [Location/environment instructions](recording-location-setup.md) cover additive
  setup, Geoapify, public-only native settings and device acceptance. The
  [Windows Mux guide](mux-local-setup.md) supplies a native tunnel alternative
  because the installed Mux CLI has no win32/x64 prebuilt executable.

## Layer 2 — System integrity: PASS within reviewed scope

Server services own capture state, claims, sessions and address admission. Exact
GPS stays private and is omitted from owner/public DTOs. Geoapify receives the
entered address, not the private device point. Provider I/O stays outside
transaction retries; locked revision/binding rechecks reject stale results after
concurrent edits. Storage completion provenance prevents legacy file adoption
from manufacturing a fresh recording upload.

Append-only guards protect accepted evidence. Claims serialize attachment/deletion;
sealed captures remain referenced. Backups include capture bindings/digests.
MongoDB, JWT, npm, Paystack-only and no personal KYC remain authoritative;
no PostGIS service was introduced.

Reviewed additive Atlas preparation verified **52 application collections / 156
indexes** and `captureVersion: 1`. Preservation hashes confirmed all **52
pre-existing collections and 4 non-marker documents** unchanged. No reset/import,
role grant, provider send or historical-data deletion ran. The scan checked
**1,140 source/public files against 8 actual private values** with **0 matches**.
Private env files were not edited by this increment.

## Layer 3 — Local verification: PASS

| Check | Observed result |
| --- | --- |
| Unit aggregate | 1,792 passed; 95 owned-fixture cases skipped by ordinary invocation |
| Final owned Mongo core | 55/55 passed, including upload provenance and stale-geocode guards |
| Separate owned finance/auth/backup | 18 financial + 20 auth + 2 backup passed; not one claimed serial 95-case run |
| Actual backup wrapper | 14 synthetic records / 4 files / 1 balanced journal / 1 claim; source preserved and restore quarantined |
| Global root ESLint | Passed |
| Native TypeScript/scoped lint | Passed |
| Final production build | Passed: 99 static pages, compile 8.9s, TypeScript 5.5s |
| Android export | Passed: 2,094 modules / about 5.8 MB |
| iOS export | Passed: 2,115 modules / about 5.8 MB |
| Native capture/address intercepted preview | 8 checks / 21 API calls / 0 errors or outbound requests; 320/390/768 widths |
| Final production web browser | All 8 journeys passed in 30.7s, plus 8 real HTTP fixture checks |
| Brand/launch assets | 9 regressions and deterministic generator check passed |
| Dependency audit | 0 vulnerabilities |
| Actual local routes | `/help`, `/favicon.ico`, `/icon.svg` returned 200 |
| Selected-Atlas auth probe | Warm nonexistent-account login returned 401 without account/session writes; aborted cold request is not first-request success evidence |

The production browser found a real 320px stepper overflow. Shrinkable grid tracks
and wrapping labels reduced its captured width from 379px to 320px; all eight
final journeys passed with the original overflow assertion, including both
lost-response/retry listing journeys. Fixture `localhost-a9a64c420dd2` used only
owned loopback Mongo, disabled providers and cleaned its owned server/database.

## Remaining acceptance and delivery

No unresolved source gap was identified in this approved increment. The delivery
revision is recorded in Git history; remote verification belongs to the final
handback. Runtime handback passed:
the user's existing Next server on 3000 returned 200 for `/help`, `/favicon.ico`
and `/icon.svg`; Metro on 8090 reports its packager running; a read-only selected-
Atlas probe confirmed reachability and capture readiness. The working user server
was preserved, and no tunnel is implied.

Physical Android/iOS testing must cover precise location/camera permissions,
actual MP4/MOV capture, interruption/offline/session recovery, backgrounding,
large uploads and launch/accessibility. Copying a large video into persistent
native draft storage can consume part of the 15-second fresh-end-reading budget
on slow storage; this needs device evidence. Device-reported GPS is not rooted-
device attestation, unit-level address proof or evidence of legal ownership.

Live Geoapify address acceptance, Mux upload/webhook/private playback and Paystack
merchant/capability/custody/fee acceptance remain deliberate runtime work. Latest
offline env inspection found only `MUX_WEBHOOK_SECRET` still a placeholder;
other Mux fields and Geoapify are populated. Presence does not prove provider
acceptance. This work started no public tunnel, real provider send/charge,
deployment, EAS/store build or release. Root Vercel deploy serves web/API; native
distribution is separate. The persistent local upload adapter additionally needs
object storage and reviewed worker/webhook hosting before a full Vercel launch.
