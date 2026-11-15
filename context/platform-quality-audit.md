# Platform quality audit and implementation

Updated 2026-11-12, Africa/Lagos. Repository: RentralMobile. npm, MongoDB/Prisma6.19.3,
local JWT and existing provider gates remain authoritative. User asked for useful
missing admin features, consistent/optimized images, whole-platform review, then
cursor-responsive grass and more homepage motion. Existing UI identity retained.

## Verified gaps addressed

1. Organization queue starvation: newest50 across all statuses could conceal old
   pending applications. New server search/status/sort/cursorpages/total defaults
   to oldest pending. Filtered GET uses strict page metadata; legacy no-query GET
   retains items-only compatibility while returning oldest pending records.
2. Operational visibility: sampled cards were not current workload counts. New
   permission-scoped overview counts all matching listing/organization/inspection/
   report/appeal/renewal/termination work and supplies oldest waiting dates. Counts
   refresh after confirmed administrative and organization decisions.
3. Historical decisions: audit history was restricted to latest50. New read-only
   server search includes actorusername/email, action, target and reason; type,
   inclusive UTCdate range, sort and stable filter-bound cursorpages supported.
   Native timestamps render WAT; audits/private metadata remain immutable/private.
4. Web listing facts: validated descriptions, landlord preferences, vehicle terms/
   insurance declarations and marine safety details were stored but hidden. New
   ListingFacts renders category allowlists as escaped text and distinguishes
   false, zero and absent values. No host declaration implies verification.
5. Reviewed safety notices: existing banner now appears on listing detail and
   before booking, in addition to host profiles. No automatic penalty introduced.
6. Direct-publish transport: valid active submit responses were mistaken for
   invalid responses. Web transport now accepts pending_verification or active for
   submissions; draft saves still require draft. Native admin also now exposes
   separate gallery/free/direct switches with actual role and owner protections.
7. Member searches consistently accept an @handle. Regex metacharacters in
   Prisma Mongo text filters are escaped, preserving literal email/name queries.

## Image architecture

AssetPhoto renders stable relative frames with responsive fill, center positioning,
explicit cover/contain modes and unavailable-image fallback. Feed/profile/gallery
previews share it. Photo-only details (including onephoto) use the real gallery,
not the old fixedsquare ListingVideo fallback. Full-photo inspection uses original
resolution in a named native dialog with keyboard arrows, Escape, focus containment
and restoration. Avatar sizing remains explicit. Native ListingPhoto derives a
bounded0.25..4 aspect ratio from actual decoded dimensions, preserves fullphoto
content and handles failures; gallery/detail share the component.

Next's public optimizer cannot forward private cookies. Deterministic private
listingphoto/poster references therefore use an authenticated custom loader and
allowlisted widths160/320/640/960/1440/1920 on the existing source route. Blob/data/
signed capability images retain their scoped original transport. Public marketing
photos continue through Next's normal optimizer; no public private-image proxy.

Server variants are WebPquality78, autorotated, completeframe widthresized without
enlargement and stripped of metadata. Original bytes/proofs are never rewritten.
Source bytes/digest/type validated;10MB/40millionpixel input bounds;3second Sharp
processing deadline;2active jobs,16FIFOwaiters,10second queue deadline. Identical
pending work coalesces. Cache is bounded32entries/32MB/30seconds and every request
still reauthorizes current listing/gallery access before cache use. Responses stay
private,no-store. Queue/failure/expiry cleanup is tested with actual raster bytes.

## Homepage motion

FooterMeadow draws semanticgreen grass in a decorative canvas. Pointer travel
bends it left/right with bounded local impulse and smooth settling; a gentle breeze
remains when idle. Frame rate and devicepixelratio are bounded, animation stops
outside the viewport/hidden tab, and reducedmotion renders static grass. The
footer controls remain above the canvas, all links fit narrow phones, and a
pause/resume control affects all homepage animations.

HomeMotion retains GSAP scope/cleanup and adds staggered category entrance,
scrolllinked hostphoto parallax, tracing truststep borders and a moving text
ribbon. Pausing reverts transforms so content remains visible. OSreducedmotion
is respected and cannot be silently overridden. No scroll hijacking, audio,
external assets or additional library dependencies introduced.

Motion references: Awwwards' reactivecursor/scrollmotion presentation
https://assets.awwwards.com/assets/files/live-presentation.pdf and mobile design
checklist https://www.awwwards.com/mobile-excellence-guidelines.pdf. Its interactive
collection pages were inaccessible to the web tool; no thirdparty design/assets
were copied. Sharp behavior verified against its official constructor/resize/output
references; Mongo filter escaping checked against pinned-family Prisma6.19 engine
source rather than assuming SQL filter behavior.

## Verification record

Focused admin overview/history tests16PASS; organization queue/API/admission/
recovery34PASS; member facts/transport27PASS; private variants/source/Nextmarkup
47PASS; native admin/photo/receipt33PASS; related listing23PASS; grass math3PASS.
These overlap the complete unit suite and are not summed as distinct totals.

Responsive Chrome: admin overview/history24PASS; organization queue16PASS;
image/fullview/memberfacts36groupedchecksPASS; actualNextgrass/motion36grouped
checksPASS; existing actualNext homepage navigation/search/reducedmotion12PASS.
All cover320/390/768/1440px. Image/grass checks found no horizontal overflow or
unapproved provider calls. A visual footer review found mobile links clipped by
its original grid; fullwidth wordmark/explicitboundedcolumns and readable utility
bar fixed it, with individual controlbounds verified afterwards.

Central final result:2,168testsPASS,113SKIP;171filesPASS,6opt-infilesSKIP. Global lint, web/mobile TypeScript and final production buildPASS (112staticpages). Local homepageHTTP200; git diff --checkPASS.
No hosted database/env/provider/dependency/deployment changes made. Docker daemon
is unavailable, so owned Mongo acceptance remains skipped; do not replace its
fixture with .env.local or hosted data. Native TypeScript/policy checks do not
establish physicaldevice acceptance.

## Remaining release work and optional expansion boundaries

- Current private uploads use local filesystem storage. A complete serverless
  Vercel launch needs durable object storage or durable backend hosting plus worker/
  webhook scheduling. A UI change cannot supply that infrastructure or acceptance.
- Actual provider capabilities/credentials, supported merchant settlement policy,
  real Android/iOS camera/GPS/push/playback and liveprovider tests remain separate.
- Booking conflict locks are per listing. Separate authorized agents can list the
  same physical asset; global crosslister availability requires explicitly reviewed
  canonical asset/unit linking. Do not automatically merge matching addresses or
  assert that duplicate allocation/fraud is impossible.
- Prebooking listingreport intake and crossdevice web savedsearches are potential
  extensions; bookinglinked reports and native device-local savedsearches already
  exist. They need their own data/retention/triage policies, not fake buttons or
  reuse of unrelated report records. No such unimplemented control was added.
