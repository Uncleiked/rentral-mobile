## Rentral Build Plan

## Current delivery plan — 2026-11-09

User-authorized stack: Expo Android/iOS, npm 11.19.1 workspaces/Node 24, local
Next.js 16.4.5 backend, MongoDB via Prisma 6.19.3, JWT email/password accounts and
local filesystem uploads. KYC onboarding and mandatory profile completion are
removed; Supabase/PostgreSQL/pnpm/OAuth are retired from the active implementation.

Implemented: native marketplace/member/owner screens; shared authenticated API
adapters; Mongo schema/index/validator/readiness setup; actual transaction locks,
overlap/ledger/hold-credit invariants; local account/session/reset flows; scoped
uploads, signed private Range/HEAD file serving and public raster avatars.

Local sequence: npm install, npm run setup:local, start the supplied Mongo replica
set, npm run db:setup, npm run dev, then npm run mobile in another terminal.
Setup preserves nonempty environment values. Initial isolated delivery made no
hosted writes; later user-authorized saved Atlas preparation and pending runtime
verification are recorded in [local-development.md](local-development.md). No old
data import or reset ran; the original PostgreSQL database remains untouched.

Final verification covers unit regressions, type/lint, native bundles, production
compilation and uniquely owned Mongo/localhost HTTP fixtures. Complete real
Android/iOS camera/GPS/permissions/playback and accessibility/network acceptance
before claiming device readiness. Provider/custody/refund/payout and operational
release work remains separate; no deployment/EAS/store submission was run.

See [implementation record](expo-implementation.md), [setup](../README.md) and
[progress](progress-tracker.md). The original phases below are historical target
groupings and must not reinstate KYC, hosted migrations or obsolete stack rules.

> Historical production plan: [production-plan.md](production-plan.md). Its
> unresolved financial/provider constraints remain relevant, while current local
> stack and acceptance instructions above take precedence.

## Core Principle

Strict Decoupling of Presentation and Logic: Full-page UI is built with mock data first and verified visually before any backend infrastructure, AI orchestration, or spatial logic is written. Every feature must follow a visible, testable, two-step lifecycle. There are no invisible backend phases. If the UI is not polished, responsive, and behaviorally sound, no database mutations or third-party APIs (OPay, Gemini, PostGIS) are wired.

## Phase 1 — Foundation & Core Infrastructure

### 01 Homepage & Navigation

Build the complete homepage UI acting as the entry point to the marketplace.

#### UI:

Navigation: Top navbar featuring Rentral logo, category links (Houses, Cars, Boats), "Rentral Insights" B2B link, and primary "Sign In / Get Started" button.

Hero Section: High-converting headline focusing on "Zero-Fraud, Geolocation-Backed Rentals," category search pill, and dynamic background video loop.

Value Proposition: Three-column layout detailing the trust loop: 1. Hardware-locked listings, 2. Geo-fenced Escrow, 3. AI verified documents.

Testimonial & Social Proof: Cards showing successful handshakes and total escrow volume securely processed.

Footer: Standard secondary routing, legal links, and social proofs.

#### Logic:

"Get Started" triggers Supabase Auth modal/redirect.

Unauthenticated users can view the homepage but clicking any "Book Inspection" or "Create Listing" CTA routes them strictly to the Auth flow (/sign-in).

### 02 Authentication & KYC Onboarding

Establish identity verification using Supabase Auth and Didit.

#### UI:

Auth Canvas: Minimalist Supabase login/signup page supporting Google OAuth, Apple ID, and Email OTP.

KYC Onboarding: Post-login multi-step form requesting Legal Name, Username, and Document Type (NIN, BVN, Passport). Include a "Processing" state with a pulsing trust badge and progress indicator.

#### Logic:

Integrate Supabase Auth Middleware to protect /listing/create, /checkout, /messages, and /profile.

Identity Resolution: On onboarding submission, fire payload to Didit API.

Listen for Didit async webhooks in /api/webhooks/didit.

Update Supabase profiles table kyc_status from pending to verified.

Restrict listing creation and booking capabilities if kyc_status is not verified.

### 03 Telemetry & PostHog Initialization

Set up behavioral tracking before any core marketplace logic to power the B2B 'Rentral Insights' portal.

#### Logic:

Create lib/posthog-client.ts — initialize PostHog browser client with NEXT_PUBLIC_POSTHOG_KEY.

Create lib/posthog-server.ts — initialize PostHog server client with flushAt: 1 and flushInterval: 0 for immediate backend event logging.

Wrap the Next.js App Layout in the PostHog Provider.

Call posthog.identify() upon Supabase Auth login success with the user ID.

Configure abstract grid mapping (strip exact PII/GPS) before ingestion to comply with data privacy laws while enabling real estate B2B data monetization.

#### 04 Database & Spatial Schema Setup

Provision the Supabase/PostgreSQL schema with PostGIS extensions before any data flows.

#### Logic:

Enable PostGIS extension on Supabase SQL editor.

Create profiles table: id, username, full_name, kyc_status, reputation_score, account_number.

Create listings table: id, lister_id, category, base_rent_amount, total_package_price, asset_metadata (jsonb), lease_expiration_date, listing_status. Include PostGIS geography columns hardware_coordinates and address_coordinates (Point, 4326).

Create transactions table: id, listing_id, seeker_id, amount, status, lease_duration_years, escrow_otp_hash.

Provision Storage Buckets: listings-media, compliance-docs, termination-docs.

Enforce Row Level Security (RLS) policies on all tables ensuring users can only mutate their own records.

## Phase 2 — Hardware-Locked Inventory & AI Audits

#### 05 Listing Capture — Full UI

Build the mobile-first asset capture flow with mock video streams. No DB saves yet.

#### UI:

Capture Canvas: Full-screen camera interface with "Start 120s Walkthrough" button, a visible GPS lock indicator (red/green dot), and a countdown timer.

Metadata Form: Dynamic Zustand-powered multi-step fields based on category (e.g., Bedrooms/Bathrooms for Houses; Engine/Mileage for Cars). Base price and agent fee inputs.

AI Document Upload Zone: Drag-and-drop area for C of O or CAC registration, clearly labeled "AI Forgery Check".

Checkout Prompt: UI for the ₦1,000 anti-spam platform listing fee.

#### 06 Spatial Integrity & Upload Logic

Wire hardware-level GPS capture, media streaming, and creation logic to DB.

#### Logic:

Request navigator.geolocation concurrently with HTML5 MediaDevices (WebRTC) in the browser.

Invariant: Deny capture completely if GPS permission is rejected, unavailable, or spoofed.

Pipe video buffer to Mux Video API for HLS transcoding; store raw backup in listings-media bucket.

Generate OPay dynamic Virtual Account for the ₦1,000 listing fee. Wait for webhook confirmation.

Save listing to DB: Server Action converts raw GPS to PostGIS Point ST_SetSRID(ST_MakePoint(lon, lat), 4326).

Run server-side ST_Distance geocoder sanity check against the manual text address provided by the user.

#### 07 AI Document Verification (Gemini 1.5 Pro)

Automate title and business verification via multimodal AI.

#### Logic:

Upload document PDF/Image to compliance-docs bucket.

Trigger Next.js Server Action api/verify/document-upload.

Send file buffer to Google Gemini 1.5 Pro via the SDK.

System Prompt: Instruct Gemini to act as a forensic document auditor. Analyze EXIF data, layer consistency, font structures, and textual anomalies for signs of digital manipulation.

Parse strictly structured JSON response: { "authentic": boolean, "confidence": number, "findings": string[] }.

Update DB: Set document_verification_status to verified or flag for manual admin review.

#### 08 Listing Modification UI & Logic

Allow price and metadata updates while strictly locking physical attributes.

#### UI:

Edit form pre-filled with current listing data (price, description, amenities).

Visual padlock icons heavily layered over the Map/Location and Video sections indicating they are strictly immutable.

#### Logic:

Server Action validates updates specifically to base_rent_amount and asset_metadata.

Constraint Enforcement: The API route explicitly strips any payload attempting to alter hardware_coordinates or video_raw.mp4. If physical traits change, the user is prompted to create a brand-new listing, preventing spatial bait-and-switch fraud.

## Phase 3 — Discovery & Multi-Year Booking Engine

#### 09 Discovery Feed — Full UI

Build the vertical video scrolling discovery experience.

#### UI:

Video Feed: Full-screen vertical scrolling player (TikTok/Reels style) auto-playing mock Mux streams.

Overlays: Glassmorphic cards displaying Price, Asset Type, and Trust Badges (AI Verified, Geolocation Locked).

Interactions: "Like" heart button, "Share to Chat" icon, and a primary "Book Inspection / Rent Now" bottom sheet trigger.

## 10 Feed Logic & Spatial Querying

Wire the feed to the active PostGIS listings and user telemetry.

#### Logic:

Fetch active listings from Supabase via TanStack Query, applying infinite server-side pagination.

Only load records where listing_status = 'active'.

Calculate localized distance client-side based on user's current rough location vs. address_coordinates. Raw hardware_coordinates are never exposed to the client here.

Dispatch PostHog event feed_listing_viewed with metadata (category, price range) for B2B analytics.

## 11 Multi-Year Escrow Setup UI

Build the checkout flow allowing flexible lease durations.

#### UI:

Duration Configurator: Slider or number input for "Lease Duration" (e.g., 1 Year, 3 Years, 5 Years).

Dynamic Pricing Engine: Real-time calculation multiplying base_rent_amount by duration, adding platform fees, and displaying the Grand Total.

Virtual Account Display: OPay branded checkout screen showing a dedicated account number, bank name, and a 30-minute countdown timer.

#### 12 Escrow Settlement Logic (OPay)

Wire financial routing into the corporate master ledger.

#### Logic:

Initiate OPay API request to generate a dynamic Virtual Account tied strictly to the specific transaction_id.

Listen for inbound webhook on /api/webhooks/opay.

Upon success, update transactions table status to holding_deposit.

Set the specific lease_duration_years in the transaction record based on user input.

Generate the highly encrypted escrow_otp_hash and save to DB.

Notify Seeker and Lister that the inspection phase is unlocked.

Dispatch PostHog event multi_year_escrow_locked.

### Phase 4 — Physical Handshake & Settlement

## 13 Proximity Handshake UI

Build the physical meeting interface with mock validation states.

## UI:

Lister View: Displays the property's unique 6-digit OTP token or QR code.

Seeker View: OTP input pad and a pulsing "Verifying GPS Location" radar animation.

Success (Confetti/Green check) and Failure (Red warning) state modals.

## 14 PostGIS Validation & Payout Logic

Execute the core spatial trust mechanism.

#### Logic:

Seeker inputs OTP on-site. The Next.js client aggressively fetches the Seeker's exact navigator.geolocation.

Server Action executes ST_DWithin, mathematically comparing the Seeker's live location against the Listing's hardware_coordinates using a strict 20-meter radius.

If True:

Execute OPay Payout API to send the bulk funds to the Lister's bank account (minus Rentral's fee).

Update listing status to rented.

Calculate exact lease_expiration_date (Current Date + lease_duration_years from transaction).

Dispatch PostHog event spatial_handshake_success.

If False: Abort transfer, flag transaction, prompt UI warning regarding distance mismatch.

### 15 Real-Time Negotiations (Chat)

Enable Lister/Seeker communication without leaving the platform.

## UI:

Thread List: Inbox showing active negotiations with unread badges.

Chat Canvas: Message bubbles, unread indicators, and embedded dynamic listing cards.

## Logic:

Wire Supabase Realtime (WebSockets) to a messages table.

Implement Zustand to handle typing indicators and optimistic UI updates for a zero-latency, native-app feel.

Restrict message attachments to strictly prevent off-platform direct payments.

## Phase 5 — Continuous Lifecycle & Analytics

## 16 Continuous Lease Renewal Trust Routing (Year 2+)

Handle continuous tenancy verification for 1, 3, 5+ year leases without active escrow.

## UI:

Dashboard alert banner: "Your lease expires in 30 days. Verify renewal to boost Trust Score."

Input form requesting the Open Banking Hash of the direct payment made to the landlord.

## Logic:

Deno CRON Edge Function (trigger-lease-renewals) scans DB daily.

Exactly 1 month before any specific lease_expiration_date (regardless of the initial multi-year term length), dispatch alert.

Tenant submits payment hash. Server Action hits Paystack/OPay Open Banking API.

Verify the recipient account of the hash matches the Lister's registered account_number.

If verified: Increment Tenant's reputation_score, add the newly paid duration to lease_expiration_date (pushing it into the future), and update listing to directly_managed.

### 17 Lease Termination & Unfreezing

Return inventory to the marketplace upon tenant exit.

#### UI:

"End Tenancy / Vacate" button in the Lister/Tenant dashboard.

File upload UI strictly requesting a "Mutual Vacation Deed" or formal "Exit Clearance."

#### Logic:

Send uploaded document to Gemini 1.5 Pro via /api/verify/lease-termination for multi-modal forensic analysis (checking signatures, dates, and intent).

Upon positive AI verification, execute Server Action to instantly update listing status from rented back to active.

Nullify the lease_expiration_date and push the asset back into the Discovery Feed for new seekers.

## 18 Profile & Trust Ledger Dashboard

Build the user command center and B2B analytics views.

#### UI:

Trust Score: Circular progress indicator displaying the user's out-of-5.00 reputation score.

Asset Portfolio: Grid of owned/active listings for Landlords.

Active Leases: Status cards for Tenants showing time remaining and upcoming renewal pulses.

Insights Widget (B2B Mode): Clean analytical charts (Line/Bar graphs) showing local demand velocity and pricing elasticity.

#### Logic:

Fetch user aggregated data from profiles, listings, and transactions.

Pull read-only analytical chart data securely using the PostHog Server API, aggregating anonymous regional data.

## Execution Summary

Phase 1 — Foundation: 4 Core Features (Homepage UI, superbase auth, Didit, PostHog, PostGIS Schema)

Phase 2 — Hardware Inventory: 4 Core Features (Capture UI, GPS/Mux Logic, Gemini Audits, Locked Editing)

Phase 3 — Discovery Engine: 4 Core Features (Feed UI, Spatial Queries, Multi-Year Checkout UI, OPay Escrow)

Phase 4 — Settlement: 3 Core Features (Handshake UI, ST_DWithin Logic, Realtime Chat)

Phase 5 — Continuous Lifecycle: 3 Core Features (Year 2+ CRON Renewals, Gemini Move-Out Unfreezing, PostHog Dashboards)

Total Architectural Milestones: 18 distinct, highly testable engineering phases.
