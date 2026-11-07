# Discovery and profile implementation

Updated 2026-11-07.

The Next.js modular monolith and strict TypeScript boundaries are retained.
`MarketplaceShell` composes one top navigation and a safe-area-aware mobile bottom
navigation. Existing `MarketplaceSidebar` imports now resolve to the shared top
navigation; old left gutters were removed from discovery, listing hub and profiles.

Discovery is server rendered with validated URL filters, stable `(createdAt,id)`
cursor pagination, a photographic grid and an explicit-play walkthrough feed.
Filters support category, neighborhood query, NGN budget, rental intent, state,
studio/bedroom/bathroom/kitchen counts, transmission/seats and boat capacity/captain.
Counts are exact matches, not implicit minimums. Intent uses metadata `rentalIntent`;
legacy missing intent is treated as rent. Switching categories clears incompatible
category-specific filters. Existing price units fall back to year for homes and day
for vehicles/boats; declared `pricePeriod` overrides that display.

Only active listings are discovered. Mux-enabled public inventory requires ready
media. All projections omit recorded coordinates, storage keys, document references,
private profile data and full street addresses. Display locations come from a known
neighborhood allowlist and otherwise say Lagos, Nigeria. Detail pages permit owners
to preview their own unpublished inventory. Saved photos use unoptimized protected
same-origin media URLs, preserving request credentials and avoiding shared caches.

Saved listings use authenticated, owner-scoped upsert/delete actions and explicit
save state. They are gated by `RENTRAL_PLATFORM_ENABLED`, so unapplied new tables are
never queried while the gate is off. Copy/native sharing handles cancellation and
clipboard failure. Booking links use `/marketplace/bookings/new`; sale intent offers
inspection/contact rather than rental checkout. Pending owners can initiate the
configured listing-fee checkout; payment never directly publishes a listing.

Profiles now show actual listings and completed-booking reviews. Fabricated wallet,
lease, credit, followers, security-device and license statistics are not rendered.
Identity badges describe identity verification only. Settings retain profile edits
and correctly report a failed sign-out rather than pretending it succeeded.

Verification: 15 focused Vitest regressions passed for filter boundaries, privacy
projections, active-only queries, timestamp-tie pagination, Mux readiness, staged
schema guards, authentication and ownership-scoped saving. The final full TypeScript
check passed. Focused discovery, API and profile lint batches passed. Full integration lint,
build and browser checks are coordinated by the root agent. Authenticated hosted
media, real SQL query plans and device acceptance still require staging verification.
