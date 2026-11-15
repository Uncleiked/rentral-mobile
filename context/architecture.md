## Rentral: Multi-Asset Spatial Trust Architecture

## Latest admin/social and storage boundaries - 2026-11-15

The [increment guide](social-admin-release.md) supersedes older gallery-only
manual-review and filesystem-only deployment statements. Gallery grants produce
versioned review-bypass evidence bound to the current account grant revision and
authority file digest; human review/payment/GPS records are never fabricated.
New social edges/likes and direct conversation acceptance use current accounts,
transaction locks, explicit desired state, mutation receipts and atomic
notifications. Block/request boundaries apply to writes, presence and read
feedback; native legacy listing conversations retain their existing DTOs.

Reviewed setup installs additive SocialFollow/SocialBlock/ListingLike and
MediaBlob/GridFS collections and independent feature markers. The Conversation
replacement unique index is created before the known old constraint is removed.
Runtime never prepares schema/indexes. Durable media uses same-database GridFS
with immutable heads/tombstones, bounded validated chunks and signed range reads.
Raw GPS/private documents are not added to public social or search responses.
No hosted activation is implied by source completion.


## Current architecture â€” 2026-11-10

- `/admin` and native Admin share current-role services and strict versioned
  commands with atomic audit/receipt readback. Owner authority is persisted by
  account ID; ordinary role/suspension/closure cannot remove the owner. Ownership
  transfer is explicit and serialized. Financial independence remains in force.
- Human document approval binds exact private bytes/path/digest; Gemini screening
  is removed. A publication-fee waiver is its own audited decision, never a fake
  payment or ledger entry. Paid collections and unknown references remain factual.
- Listings distinguish `recorded` from `approved_gallery`. Gallery proof binds up
  to ten owned photos and one optional video to durable storage claims; current
  gallery permission/revision gates writes/publication/discovery. Revocation hides
  affected listings pending review. No capture or GPS match is manufactured.
- Gallery inspections use independent manual evidence review without spatial
  proof or provider settlement. Recorded inspections retain proximity/handshake.
  Additive preparation records `ownerAdminVersion: 1`; existing records persist.

- Node 24.x/npm 11.19.1 workspace: Next.js 16.4.5 web/API and Expo SDK 58 native app.
- MongoDB via pinned Prisma 6.19.3. Do not upgrade to Prisma 7 until its MongoDB
  connector is supported and accepted. Mongo requires a replica set; reviewed
  indexes/validators/readiness marker come from `npm run db:setup`, not SQL
  migrations or `prisma db push`.
- Local JWT email/password accounts: salted scrypt-v1 hashes; access tokens for 15 minutes,
  hashed one-use rotating refresh/session lifetime of 30 days; every access reads the current
  private AuthSession and User staff_role. JWT_SECRET stays backend-only.
- Web HttpOnly cookies and native bearer transport call the same server domain
  services. Native code never imports Prisma, filesystem access or server secrets.
  Cookie refresh shares bounded in-flight work; direct refresh remains strict CAS.
- Local filesystem storage under RENTRAL_STORAGE_DIR (default workspace/storage).
  Owner-scoped streamed uploads validate size/type/magic/path; private reads need
  short-lived purpose/bucket/path-bound JWTs and support Range/HEAD.
- KYC initiation/onboarding/profile gates are removed. Existing identity history
  remains truthful, separate from authentication and authorization. Supporting
  asset documents/publication review are still required where applicable.
- Actual revision writes lock shared listing/booking/user records before state
  checks. Bounded conflict retries contain database work only. Rental/hold overlap
  protection, balanced immutable ledger inserts and one-use paid-hold allocation
  are enforced in shared services. Provider HTTP never runs inside retry callbacks.
- Capture GPS is private ListingCapture start/end evidence plus the associated
  ListingLocation geometry, never a public Listing scalar. A session-bound online
  begin/finish lifecycle precedes immutable digest-bound video sealing. Submission
  and changed posted addresses require a precise backend Geoapify match within
  100 metres; address/capture/video proofs are rechecked under write locks. Ordinary
  metadata saves cannot change accepted capture GPS. Additive captureVersion1 setup
  enables these operations; missing setup does not disable unrelated auth.
  Bounded Haversine checks replace PostGIS distance SQL; public/owner projections
  never return raw coordinates. Monthly Insights count distinct contributors and hide
  cohorts below ten people.
- Central Prisma guards reject direct/nested mutation of ledger/audit/allocation
  records; cross-document balance/allocation constraints remain service-owned.
  This is not protection against privileged raw database administration.

The 2026-11-10 recording/branding increment is described in
[the approved blueprint](capture-location-brand-blueprint.md) and
[recording environment guide](recording-location-setup.md). Brand geometry/palette
is canonical in `lib/brand/identity.json`, with deterministic SVG/native/ICO assets.
Native launch is bounded, reduced-motion aware and independent of backend readiness;
error fallbacks release the operating-system splash. The favicon PNG frame remains
RGBA/32-bit even though the iOS launcher PNG must be opaque RGB.

The app/backend run locally; the user subsequently selected the saved Atlas
database. Setup preserves existing nonempty environment values. Initial isolated
delivery made no hosted writes; later authorized Atlas preparation and current
account-flow status are recorded in [runtime troubleshooting](local-development.md).
No legacy-data import, provider activation or deployment ran; the original
PostgreSQL database remains untouched. Supabase has no active role. Its migrations are archived
source and must not be replayed into Mongo. Existing financial/provider gates
and acceptance requirements remain in force. See [API](mobile-api.md),
[implementation](expo-implementation.md), and [setup](../README.md).

Oluso monitoring is optional and starts only when OLUSO_ENABLED=true and
OLUSO_API_KEY are configured; unconfigured monitoring does not block startup.

The approved completion build now includes member/host native workflows and web
staff workspaces for listing review, finance, safety, matching and lease changes.
Shared services cover durable media claims, booking quotes/check-in/hold credit,
participant messaging/activity/read receipts, notifications, saved searches,
consented Insights, reviewed sponsored campaigns and manual-term commercial
orders. These are persisted workflows, not mock wallet balances or credit scores.

Paystack is the sole payment adapter. Collections, recipients, refunds, transfers,
authenticated receipts and reconciliation bind exact kobo amounts and provider
environment. Independent approval, durable fund reservations and immutable
journals separate collection from settlement; an unknown provider outcome remains
uncertain until readback. Merchant permissions and custody/policy approval remain
required before enabling real financial mutations. See [Paystack](paystack-integration.md).

Account security includes password/session controls, dual-mailbox email changes,
and encrypted durable Resend delivery when explicitly configured. The private
development outbox remains available without sending mail. A signed expired
access token can prove revocation of its own session only; it never authenticates
an API request. Credential rotation and all-session revocation also revoke prepared
push registrations. Soft closure hides public participation and revokes access
while retaining owed financial/evidence history; exports are bounded allowlists.

Optional Expo push uses a public EAS project UUID plus server-only encrypted
device tokens, current session/consent checks and delivery receipts. Push remains
off without its explicit gate and configuration. The mobile public configuration
is EXPO_PUBLIC_API_URL and optional EXPO_PUBLIC_EAS_PROJECT_ID only.

Web Inter is bundled through next/font/local; native Inter is bundled through
expo-font. Startup/build does not download Google Fonts. Encrypted backup tooling
captures Mongo plus private storage/tombstones; restore verification accepts only
a fresh owned local target, quarantines credentials/providers, and cannot perform
an automatic production cutover. See [backup operations](backup-operations.md),
[retention](backup-retention.md), [environment setup](environment-setup.md) and
[current verification evidence](progress-tracker.md). No real email, push, payment,
Mux/AI/geocoding acceptance or physical-device release is implied by source tests.

## Historical architecture below â€” superseded stack and examples

> Historical target: [Architecture and Delivery Plan](production-plan.md), reviewed
> 2026-09-24. Preserve its provider/financial constraints, but use the current
> architecture above for stack, authentication, persistence and local setup.

### Stack Overview

#### Frontend & Core Framework

Framework: Next.js 16 (App Router) & React 19 - Full stack execution, Server Actions, and incremental prefetching.

Styling: Tailwind CSS v4 & Shadcn UI - Mobile-first, glassmorphic UI tokens mimicking social discovery feeds.

Client State: Zustand - Persists multi-step listing captures, checkout states, and session data locally.

Data Fetching: TanStack Query v5 & Axios - Optimized client-side DB caching and mutation cycles.

#### Backend, Data & Spatial Infrastructure

Database Engine: Supabase (Enterprise PostgreSQL) - Relational ledger with strict Row Level Security (RLS).

Spatial Engine: PostGIS Extensions - Core trust mechanism; calculates hardware vs. address coordinates using mathematical invariants (ST_Distance, ST_DWithin).

Media Processing: Mux Video API & HTML5 MediaDevices - In-app capture of 120s walkthroughs, transcoded into adaptive signed HLS streams.

## Authentication & Verification

Identity Provider: Supabase Auth - Web middleware integration, OAuth, and JWT session parsing.

Regulatory KYC: Didit - Webhook architecture for local registry matching (NIN, BVN, Passport, CAC).

AI Document Forgery Audit: Google Gemini 1.5 Pro - Multi-modal screening of Title Documents, Vacation Deeds, and CAC registrations for digital alteration.

## Financial Routing & Telemetry

Payment Gateways: OPay & Paystack APIs - Split-escrow routing, dynamic virtual accounts, and Open Banking verifications.

Analytics & Telemetry: PostHog - Comprehensive event tracking, behavioral analytics, conversion funnels, and real-time dashboarding. This forms the absolute foundation for the B2B 'Rentral Insights' predictive engine.

## Folder Structure

/
â”œâ”€â”€ app/
â”‚   â”œâ”€â”€ layout.tsx                              â†’ Root layout, Providers (Supabase Auth, QueryClient, PostHog)
â”‚   â”œâ”€â”€ page.tsx                                â†’ Homepage (Value prop, category entry)
â”‚   â”œâ”€â”€ (auth)/
â”‚   â”‚   â”œâ”€â”€ sign-in/                            â†’ Supabase Auth flow
â”‚   â”‚   â”œâ”€â”€ sign-up/                            â†’ Supabase Auth flow
â”‚   â”‚   â””â”€â”€ onboarding/                         â†’ Didit KYC, Username selection
â”‚   â”œâ”€â”€ feed/
â”‚   â”‚   â””â”€â”€ page.tsx                            â†’ Vertical-scrolling video discovery feed
â”‚   â”œâ”€â”€ listing/
â”‚   â”‚   â”œâ”€â”€ create/                             â†’ Mobile-first camera capture & metadata forms
â”‚   â”‚   â”œâ”€â”€ edit/[id]/                          â†’ Active listing metadata modification UI
â”‚   â”‚   â””â”€â”€ [id]/                               â†’ Detailed asset parameters & public reviews
â”‚   â”œâ”€â”€ checkout/
â”‚   â”‚   â”œâ”€â”€ escrow-setup/                       â†’ Dynamic Virtual Account generator UI (Multi-year capable)
â”‚   â”‚   â””â”€â”€ handshake/                          â†’ OTP & GPS Proximity UI for inspections
â”‚   â”œâ”€â”€ messages/
â”‚   â”‚   â””â”€â”€ page.tsx                            â†’ WebSocket chat, direct share cards
â”‚   â”œâ”€â”€ profile/
â”‚   â”‚   â””â”€â”€ page.tsx                            â†’ Trust Score ledger, active listings
â”‚   â”œâ”€â”€ admin/
â”‚   â”‚   â””â”€â”€ page.tsx                            â†’ Force release/refund console (is_admin=true)
â”‚   â””â”€â”€ api/
â”‚       â”œâ”€â”€ webhooks/
â”‚       â”‚   â”œâ”€â”€ opay/route.ts                   â†’ Inbound payment settlement listener
â”‚       â”‚   â””â”€â”€ didit/route.ts                  â†’ KYC async status updates
â”‚       â”œâ”€â”€ verify/
â”‚       â”‚   â”œâ”€â”€ document-upload/route.ts        â†’ Gemini AI multi-modal forgery checks (Deeds, CAC)
â”‚       â”‚   â””â”€â”€ lease-termination/route.ts      â†’ Vacancy verification to unfreeze listings
â”‚       â”œâ”€â”€ billing/
â”‚       â”‚   â””â”€â”€ continuous-renewal/route.ts     â†’ Open Banking cross-check for Year 2+ renewals
â”‚       â”œâ”€â”€ analytics/
â”‚       â”‚   â””â”€â”€ ingest/route.ts                 â†’ Server-side PostHog event proxy for B2B insights
â”‚       â””â”€â”€ admin/
â”‚           â””â”€â”€ force-settlement/route.ts       â†’ Emergency escrow overrides
â”œâ”€â”€ components/
â”‚   â”œâ”€â”€ ui/                                     â†’ Shadcn primitive components
â”‚   â”œâ”€â”€ feed/
â”‚   â”‚   â”œâ”€â”€ DiscoveryFeedCard.tsx               â†’ MuxPlayer, glassmorphic overlays, trust badges
â”‚   â”‚   â””â”€â”€ EngagementActions.tsx               â†’ Like, direct share, message triggers
â”‚   â”œâ”€â”€ listing/
â”‚   â”‚   â”œâ”€â”€ VideoCaptureCanvas.tsx              â†’ WebRTC camera stream, HTML5 Geolocation hooks
â”‚   â”‚   â”œâ”€â”€ SpatialMetadataForm.tsx             â†’ Dynamic fields (House vs Car vs Boat)
â”‚   â”‚   â””â”€â”€ ListingEditor.tsx                   â†’ Form for updating prices/prefs without altering GPS
â”‚   â”œâ”€â”€ escrow/
â”‚   â”‚   â”œâ”€â”€ MultiYearConfigurator.tsx           â†’ UI for defining custom lease duration payouts
â”‚   â”‚   â”œâ”€â”€ VirtualAccountDisplay.tsx           â†’ OPay checkout renderer
â”‚   â”‚   â””â”€â”€ ProximityScanner.tsx                â†’ OTP input & navigator.geolocation execution
â”‚   â””â”€â”€ chat/
â”‚       â”œâ”€â”€ ThreadList.tsx                      â†’ Active negotiations
â”‚       â””â”€â”€ ChatCanvas.tsx                      â†’ Supabase Realtime message streams
â”œâ”€â”€ instrumentation-client.ts                   â†’ Client-side PostHog init (Next.js App Router convention, not lib/)
â”œâ”€â”€ lib/
â”‚   â”œâ”€â”€ supabase/
â”‚   â”‚   â”œâ”€â”€ client.ts                           â†’ Browser SSR client
â”‚   â”‚   â””â”€â”€ server.ts                           â†’ Server-side client with admin roles
â”‚   â”œâ”€â”€ payment/
â”‚   â”‚   â”œâ”€â”€ opay-engine.ts                      â†’ Virtual account & automated payout fetch wrappers
â”‚   â”‚   â””â”€â”€ paystack-engine.ts                  â†’ Pan-African fallback routing
â”‚   â”œâ”€â”€ spatial/
â”‚   â”‚   â””â”€â”€ math.ts                             â†’ Client-side coordinate distance estimators
â”‚   â”œâ”€â”€ gemini.ts                               â†’ AI Engine initialization
â”‚   â”œâ”€â”€ posthog.ts                              â†’ Server-side telemetry singleton + captureServerEvent() helper
â”‚   â””â”€â”€ utils.ts                                â†’ Tailwind merge, formatting tools
â”œâ”€â”€ store/
â”‚   â””â”€â”€ useRentralStore.ts                      â†’ Zustand: Local UI overrides, active booking context
â”œâ”€â”€ supabase/
â”‚   â”œâ”€â”€ migrations/                             â†’ PostGIS DDL schemas & RLS policies
â”‚   â””â”€â”€ functions/
â”‚       â”œâ”€â”€ handle-holding-expiration/          â†’ Deno Edge function for 24-hour split payouts
â”‚       â””â”€â”€ trigger-lease-renewals/             â†’ Deno CRON processing dynamic multi-year alerts
â””â”€â”€ types/
    â”œâ”€â”€ database.ts                             â†’ Supabase auto-generated typings
    â””â”€â”€ platform.ts                             â†’ Core TS Interfaces (Profiles, Listings, Transactions)


## System Boundaries

app/: Contains Next.js App Router definitions, server-side data fetching for initial loads, and secure API endpoints. No heavy client-side state manipulation here.

components/: Pure UI layer. Subscribes to Zustand stores and TanStack Query. Contains no direct database connection logic; uses Server Actions or API routes for mutations.

lib/: SDK initializers, shared utilities, and third-party wrappers (OPay, Supabase Auth, Gemini, PostHog).

store/: Global client state (Zustand). Manages non-persisted transactional flows like the multi-step listing wizard before database submission.

supabase/functions/: Deno-based edge compute. Owns time-delayed operations (24-hour holding lock expiration, multi-year lease expiration CRON jobs) and secure backend-to-backend API calls (OPay split settlement) outside the Next.js runtime.

## Data Flow Workflows

1. Hardware-Locked Listing Creation & Modification

Creation: User activates VideoCaptureCanvas natively requesting navigator.geolocation. User completes 120s walkthrough, inputs metadata, and pays â‚¦1,000 listing fee via OPay. Server validates payment, checks ST_Distance geocoder sanity, and activates listing.

Modification (Edit Mode): Listers can edit dynamic variables (rent amount, agent fees, structural descriptions, and tenant preferences) via app/listing/edit/[id]. Architectural Constraint: The core hardware_coordinates and video_raw.mp4 cannot be edited. If the physical asset changes or is misrepresented, the user must create a brand-new listing, preventing bait-and-switch spatial fraud.

2. Multi-Year Lease Settlement & GPS Handshake

Inspection: Seeker books inspection (â‚¦3,000 escrow), meets Lister on-site, and scans OTP. PostGIS ST_DWithin verifies 20m radius. If True, inspection fee drops to Lister.

Multi-Year Upfront Payment: When moving to full settlement, the Seeker uses the MultiYearConfigurator. Even if the base listing is 1 year, the Seeker can input a custom duration (e.g., 5 years). The system multiplies the total, generating an OPay Virtual Account for the bulk sum.

Handshake & Execution: Upon final key handover (OTP scan), funds are disbursed. The database logs the transaction with lease_duration_years = 5, and calculates the exact lease_expiration_date.

3. Continuous Lease Renewal Trust Routing (Year 2+)

Dynamic Pulse: A backend CRON job (trigger-lease-renewals) evaluates the lease_expiration_date. Exactly 1 month before expiration (whether it's Year 1, Year 3, or Year 5), it sends a renewal pulse.

Hash Cross-Check: Tenant inputs their Open Banking Hash and selects who they paid (Original Agent vs. Landlord).

Validation: Next.js requests hash validation from OPay/Paystack API. If it matches the Landlord's account_number, the listing updates to directly_managed.

Continuous Loop: The Tenant's reputation_score increments, and the lease_expiration_date is pushed forward by the newly paid duration, keeping the data alive infinitely until move-out.

4. Lease Termination & Inventory Unfreezing

When a tenant vacates a property at any point, the listing must re-enter the active marketplace.

The Landlord or Tenant uploads a formal Move-Out Document (e.g., Mutual Vacation Deed or exit clearance).

The file is sent to api/verify/lease-termination where Google Gemini 1.5 Pro performs a multi-modal analysis to verify signatures, context, and lack of digital alteration.

Upon Gemini approval, the database state of the listing instantly switches from rented to active, unfreezing the asset and pushing it back into the discovery feed.

5. Telemetry & B2B Analytics Pipeline (PostHog)

Ingestion: PostHog tracks high-intent interactions asynchronously. Events captured include listing_hardware_locked, spatial_handshake_success, checkout_abandoned, and multi_year_lease_locked.

Privacy: Personally Identifiable Information (PII) is stripped. Coordinates are abstracted to neighborhood grids (e.g., "Yaba Zone B") before ingestion.

Monetization (Rentral Insights): This continuous stream of factual market behavior feeds the B2B portal, allowing developers to query exact price elasticity, average multi-year cash commitments, and specific typology demand heatmaps.

## Database Schema (PostGIS & PostgreSQL)

## profiles

id (text, PK): References Supabase Auth userId.
username (text, unique): Public-facing handle.
full_name (text): Legal name from KYC.
kyc_status (enum): 'unverified', 'pending', 'verified', 'flagged'.
id_type / id_number (text): NIN, BVN, Passport references.
is_admin (boolean): System override capability (default: false).
bank_code / account_number (text): Destination for programmatic payouts.
reputation_score (numeric 3,2): 0.00 to 5.00 trust index.
is_business_verified (boolean): Tied to CAC document validation.

## listings

id (uuid, PK): Primary record ID.
lister_id (text, FK): References profiles.id.
category (enum): 'house', 'car', 'boat'.
text_address (text): Human-readable location.console.log();
hardware_coordinates (geography(Point, 4326)): Raw device GPS captured during recording.
address_coordinates (geography(Point, 4326)): Geocoded text mapping.
physically_verified (boolean): True if PostGIS distance math passes.
admin_bypass_verification (boolean): Developer sandbox flag.
base_rent_amount (numeric): Cost per fundamental unit (year/day).
total_package_price (numeric): Comprehensive checkout sum for 1 unit.
asset_metadata (jsonb): Flexible payload (bedrooms, engine_type, vessel_capacity, management_type).
listing_status (enum): 'pending_payment', 'active', 'on_hold', 'rented'.
lease_expiration_date (timestamptz): Dynamically calculated end date for current occupancy.

## transactions

id (uuid, PK): Internal ledger ID.
listing_id (uuid, FK): References listings.id.
seeker_id (text, FK): References profiles.id.
amount (numeric): Total value processed.
payment_processor_fee (numeric): Gateway cut stripped before settlement.
type (enum): 'listing_fee', 'inspection_fee', 'holding_deposit', 'total_package'.
status (enum): 'pending', 'successful', 'refunded', 'payout_settled'.
lease_duration_years (integer): Custom duration defined at checkout (e.g., 1, 3, 5).
escrow_otp_hash (text): Encrypted physical handshake token.
payment_gateway_ref (text, unique): OPay/Paystack reference ID.

## Storage Architecture

- Bucket: listings-media
Path: listings/{listing_id}/video_raw.mp4
Purpose: Temporary staging buffer before Mux transcode streaming.

- Bucket: compliance-docs
Path: compliance/{user_id}/{doc_type}_{timestamp}.pdf
Purpose: Secure holding for CAC docs, Deeds of Assignment, and vehicle logbooks.
Access: RLS restricted to the uploader and service_role (for Gemini API extraction).

- Bucket: termination-docs
Path: terminations/{listing_id}/{timestamp}.pdf
Purpose: Holds Mutual Vacation Deeds used to officially unfreeze a property.

## Authentication & Verification Architecture

- Primary Auth: Supabase Auth Middleware. Handles Google, Apple, and Email OTP authentication natively at the edge.
- Session Injection: Supabase Auth middleware verifies the session, syncing the user's userId with the Supabase profiles.id.

- Identity Resolution (Didit): Upon onboarding, biometric and NIN/BVN inputs are fired to Didit APIs. Didit processes the government registry check and fires a secure webhook back to Rentral's backend, flipping the kyc_status from pending to verified and unlocking listing creation capabilities.

## Technical Patterns

1. Spatial Proximity Validation Pattern (PostGIS)
Rentral relies on database-level mathematics, not client-side JavaScript, to confirm physical presence.

The raw GPS coordinates from navigator.geolocation are stored as SRID 4326 geographic points.

Handshake verification executes ST_DWithin:
ST_DWithin(seeker_coordinates, target_hardware_coordinates, 20)

This ensures the seeker is strictly within 20 meters of the asset's verified origin before unlocking the escrow vault.

2. Dynamic Multi-Year Lease Lifecycles & Move-Outs

The architecture completely detaches the physical asset from rigid timeframes, enabling flexible realities of the African market.

A Tenant can override the default 1-year contract and pay for 5 years upfront.

The backend parses lease_duration_years and dynamically writes a future lease_expiration_date into the listings table.

The continuous renewal CRON job ignores the standard 12-month loop, waiting silently until Month 59 to trigger the Year 6 renewal pulse.

Should the tenant leave prematurely, the Gemini-audited move-out document breaks the loop and immediately unfreezes the inventory.

3. Zero-Friction Settlement Pattern (OPay/Paystack)

Asset owners are insulated from platform complexity.

Inbound: When a user initiates a booking, Rentral generates a Dynamic Virtual Account mapped to Rentral's Corporate Ledger. The user transfers funds via their local banking app.

Outbound: Upon physical handshake success or Holding Lock default, the backend immediately executes the Payout API (/api/v1/international/transfer).

Result: Rentral automatically subtracts its 30% cut, and the net payout lands in the Landlord's standard commercial bank account (GTBank, Zenith, etc.) instantly via NIP (Nigeria Inter-Bank Settlement System).

4. Server vs. Browser Client Architecture

Strict separation of Supabase instances to prevent security leaks:

Browser Client (@supabase/ssr createBrowserClient): Used in React components strictly for fetching public feed data or listening to real-time WebSocket chat channels.

Server Client (@supabase/ssr createServerClient): Utilized exclusively in Next.js Server Actions and API Webhooks. Configured with the SUPABASE_SERVICE_ROLE_KEY to bypass RLS when executing automated escrow payouts, recording holding lock splits, updating KYC trust scores, or unfreezing assets.

## Architectural Invariants (Strict Rules)

No Unverified Inventory: The application MUST reject any listing creation attempt that does not contain raw HTML5 geolocation coordinates fetched simultaneously with the WebRTC video stream.

Immutability of Spatial State: While users can edit listing pricing and descriptions, the hardware_coordinates and original video artifact MUST NEVER be editable. Physical changes demand a new, verified listing.

No Direct P2P Escrow Transfers: Funds MUST ALWAYS route through the Rentral Corporate Master Ledger first. Peer-to-peer direct transfers circumvent the platform fee architecture and nullify the transaction trust trace.

UI Boundary Strictness: Next.js API routes (app/api/) MUST NOT contain React UI logic. React components (components/) MUST NOT contain direct database execution logic. All mutations MUST pass through defined Server Actions.

AI Auditing Mandate: The Gemini document audit pipeline (for Titles and Move-Out Deeds) MUST always return a structured JSON object. It must gracefully fail to a "Manual Review Required" state if the AI cannot determine authenticityâ€”never default to "Approved."

Admin Sandboxing: Development bypass variables (admin_bypass_verification, is_admin_override) MUST be guarded by the profiles.is_admin = true check at the database level to prevent production manipulation.

Absolute Privacy: Raw hardware_coordinates MUST NEVER be exposed via public APIs. The frontend only receives the distance_meters offset and an obfuscated text_address until the inspection escrow is secured.
