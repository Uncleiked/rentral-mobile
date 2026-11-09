## Rentral: Multi-Asset Spatial Trust Architecture

## Current architecture — 2026-11-09

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
- Capture GPS is private ListingLocation geometry, not a public Listing scalar.
  Bounded Haversine checks replace PostGIS distance SQL; public projections never
  return raw coordinates. Monthly Insights count distinct contributors and hide
  cohorts below ten people.
- Central Prisma guards reject direct/nested mutation of ledger/audit/allocation
  records; cross-document balance/allocation constraints remain service-owned.
  This is not protection against privileged raw database administration.

The user selected local operation. Setup preserves existing nonempty environment
values; no legacy data import, hosted write, provider activation or deployment
ran. Supabase has no active role. Historical PostgreSQL migrations are archived
source and must not be replayed into Mongo. Existing financial/provider gates
and acceptance requirements remain in force. See [API](mobile-api.md),
[implementation](expo-implementation.md), and [setup](../README.md).

Oluso monitoring is optional and starts only when OLUSO_ENABLED=true and
OLUSO_API_KEY are configured; unconfigured monitoring does not block startup.

## Historical architecture below — superseded stack and examples

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
├── app/
│   ├── layout.tsx                              → Root layout, Providers (Supabase Auth, QueryClient, PostHog)
│   ├── page.tsx                                → Homepage (Value prop, category entry)
│   ├── (auth)/
│   │   ├── sign-in/                            → Supabase Auth flow
│   │   ├── sign-up/                            → Supabase Auth flow
│   │   └── onboarding/                         → Didit KYC, Username selection
│   ├── feed/
│   │   └── page.tsx                            → Vertical-scrolling video discovery feed
│   ├── listing/
│   │   ├── create/                             → Mobile-first camera capture & metadata forms
│   │   ├── edit/[id]/                          → Active listing metadata modification UI
│   │   └── [id]/                               → Detailed asset parameters & public reviews
│   ├── checkout/
│   │   ├── escrow-setup/                       → Dynamic Virtual Account generator UI (Multi-year capable)
│   │   └── handshake/                          → OTP & GPS Proximity UI for inspections
│   ├── messages/
│   │   └── page.tsx                            → WebSocket chat, direct share cards
│   ├── profile/
│   │   └── page.tsx                            → Trust Score ledger, active listings
│   ├── admin/
│   │   └── page.tsx                            → Force release/refund console (is_admin=true)
│   └── api/
│       ├── webhooks/
│       │   ├── opay/route.ts                   → Inbound payment settlement listener
│       │   └── didit/route.ts                  → KYC async status updates
│       ├── verify/
│       │   ├── document-upload/route.ts        → Gemini AI multi-modal forgery checks (Deeds, CAC)
│       │   └── lease-termination/route.ts      → Vacancy verification to unfreeze listings
│       ├── billing/
│       │   └── continuous-renewal/route.ts     → Open Banking cross-check for Year 2+ renewals
│       ├── analytics/
│       │   └── ingest/route.ts                 → Server-side PostHog event proxy for B2B insights
│       └── admin/
│           └── force-settlement/route.ts       → Emergency escrow overrides
├── components/
│   ├── ui/                                     → Shadcn primitive components
│   ├── feed/
│   │   ├── DiscoveryFeedCard.tsx               → MuxPlayer, glassmorphic overlays, trust badges
│   │   └── EngagementActions.tsx               → Like, direct share, message triggers
│   ├── listing/
│   │   ├── VideoCaptureCanvas.tsx              → WebRTC camera stream, HTML5 Geolocation hooks
│   │   ├── SpatialMetadataForm.tsx             → Dynamic fields (House vs Car vs Boat)
│   │   └── ListingEditor.tsx                   → Form for updating prices/prefs without altering GPS
│   ├── escrow/
│   │   ├── MultiYearConfigurator.tsx           → UI for defining custom lease duration payouts
│   │   ├── VirtualAccountDisplay.tsx           → OPay checkout renderer
│   │   └── ProximityScanner.tsx                → OTP input & navigator.geolocation execution
│   └── chat/
│       ├── ThreadList.tsx                      → Active negotiations
│       └── ChatCanvas.tsx                      → Supabase Realtime message streams
├── instrumentation-client.ts                   → Client-side PostHog init (Next.js App Router convention, not lib/)
├── lib/
│   ├── supabase/
│   │   ├── client.ts                           → Browser SSR client
│   │   └── server.ts                           → Server-side client with admin roles
│   ├── payment/
│   │   ├── opay-engine.ts                      → Virtual account & automated payout fetch wrappers
│   │   └── paystack-engine.ts                  → Pan-African fallback routing
│   ├── spatial/
│   │   └── math.ts                             → Client-side coordinate distance estimators
│   ├── gemini.ts                               → AI Engine initialization
│   ├── posthog.ts                              → Server-side telemetry singleton + captureServerEvent() helper
│   └── utils.ts                                → Tailwind merge, formatting tools
├── store/
│   └── useRentralStore.ts                      → Zustand: Local UI overrides, active booking context
├── supabase/
│   ├── migrations/                             → PostGIS DDL schemas & RLS policies
│   └── functions/
│       ├── handle-holding-expiration/          → Deno Edge function for 24-hour split payouts
│       └── trigger-lease-renewals/             → Deno CRON processing dynamic multi-year alerts
└── types/
    ├── database.ts                             → Supabase auto-generated typings
    └── platform.ts                             → Core TS Interfaces (Profiles, Listings, Transactions)


## System Boundaries

app/: Contains Next.js App Router definitions, server-side data fetching for initial loads, and secure API endpoints. No heavy client-side state manipulation here.

components/: Pure UI layer. Subscribes to Zustand stores and TanStack Query. Contains no direct database connection logic; uses Server Actions or API routes for mutations.

lib/: SDK initializers, shared utilities, and third-party wrappers (OPay, Supabase Auth, Gemini, PostHog).

store/: Global client state (Zustand). Manages non-persisted transactional flows like the multi-step listing wizard before database submission.

supabase/functions/: Deno-based edge compute. Owns time-delayed operations (24-hour holding lock expiration, multi-year lease expiration CRON jobs) and secure backend-to-backend API calls (OPay split settlement) outside the Next.js runtime.

## Data Flow Workflows

1. Hardware-Locked Listing Creation & Modification

Creation: User activates VideoCaptureCanvas natively requesting navigator.geolocation. User completes 120s walkthrough, inputs metadata, and pays ₦1,000 listing fee via OPay. Server validates payment, checks ST_Distance geocoder sanity, and activates listing.

Modification (Edit Mode): Listers can edit dynamic variables (rent amount, agent fees, structural descriptions, and tenant preferences) via app/listing/edit/[id]. Architectural Constraint: The core hardware_coordinates and video_raw.mp4 cannot be edited. If the physical asset changes or is misrepresented, the user must create a brand-new listing, preventing bait-and-switch spatial fraud.

2. Multi-Year Lease Settlement & GPS Handshake

Inspection: Seeker books inspection (₦3,000 escrow), meets Lister on-site, and scans OTP. PostGIS ST_DWithin verifies 20m radius. If True, inspection fee drops to Lister.

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

AI Auditing Mandate: The Gemini document audit pipeline (for Titles and Move-Out Deeds) MUST always return a structured JSON object. It must gracefully fail to a "Manual Review Required" state if the AI cannot determine authenticity—never default to "Approved."

Admin Sandboxing: Development bypass variables (admin_bypass_verification, is_admin_override) MUST be guarded by the profiles.is_admin = true check at the database level to prevent production manipulation.

Absolute Privacy: Raw hardware_coordinates MUST NEVER be exposed via public APIs. The frontend only receives the distance_meters offset and an obfuscated text_address until the inspection escrow is secured.
