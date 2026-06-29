## PROJECT OVERVIEW: RENTRAL

## About the Project

Rentral is a unified, multi-asset rental marketplace and spatial trust infrastructure designed specifically for the African digital economy, starting in Lagos, Nigeria. The platform connects asset seekers with verified houses/apartments, rental vehicles (SUVs, sedans), and marine vessels (boats, speedboats, yachts) under a single trusted identity and transactional framework.
Rentral replaces passive classified directories with an active verification engine. By binding physical asset presence to native device hardware telemetry through advanced PostGIS spatial indexing, and automating payouts through split-escrow payment gateway APIs (OPay and Paystack), Rentral programmatically eliminates lease scams, ghost listings, and double-allocation fraud.
Furthermore, Rentral captures the transactional footprint of informal payments, transforming peer-to-peer asset interactions into a proprietary Rentral Trust Score for consumer credit scoring. The aggregated, anonymized behavioral data from searches, filters, checkout dropouts, and geographic matching rates is monetized via Rentral Insights a premium B2B analytics portal built for institutional real estate developers and corporate investors.

## The Problem It Solves

The African peer-to-peer and B2C rental markets are structurally fractured and plagued by systemic security issues:

## The Integration and Trust Gap

A young professional in Lagos attempting to secure a shared apartment in Yaba, lease an SUV for a weekend road trip, or rent a boat for an event in Ilashe must jump across three separate uncoordinated platforms. This requires completing duplicate KYC verification steps, dealing with disparate payment options, and absorbing uncoordinated offline transaction risks.

## Scraped Media and Predatory Fraud

Legacy classified websites allow passive, remote image uploads. Fraudsters easily scrape legitimate listings to publish duplicate ghost listings, trapping consumers in exploitative "inspection fee" scams or catastrophic multi-allocation deposit frauds where the same property is leased to dozens of victims simultaneously.

## The Institutional Blindspot

Real estate developers and investors commit billions of Naira to building speculative projects completely blindly. Due to a complete absence of localized, high-fidelity empirical search telemetry, developers frequently build luxury, multi-bedroom structures in sectors where real consumer demand is starving for functional co-living spaces or micro-apartments.

## The Invisible Cash Economy

Billions of Naira move informally via cash or direct bank transfers. Because these transactions leave zero digital footprint, everyday consumers remain completely credit-invisible, unable to leverage their largest annual expenditure (rent) to build credit histories or access formal 
financial services.

## Pages

### Homepage (/)

Landing page featuring the consumer value proposition, how the spatial trust loop works, asset categories, and clear call-to-actions.

### Authentication (/login)

Secure entry gate handled by superbase auth, facilitating Google, Apple, and email/password sign-in.

### Onboarding (/onboarding)

A multi-step onboarding journey collecting personal details and initiating Tier-1 identity verification (NIN/BVN/Passport) via Didit. Once verified, the user reserves a unique username.

### Discovery Feed (/marketplace)

The primary interactive marketplace interface. It functions as a mobile-first, vertical-scrolling stream of looping walkthrough videos with glassmorphic overlay panels and engagement triggers, matching an Instagram Reel experience.

### Create Listing (/listing/create)

A browser-native multi-asset listing wizard. It prompts mobile users to record a continuous walkthrough video while capturing device GPS coordinates, followed by inputting dynamic structural fields based on asset type.

### Asset Details (/listing/[id])

Detailed page containing structural parameters, the lister's public reputation score, verified review histories, and actionable operational pathways (such as Booking Inspection or Secure 24-Hour Hold).

### Unified Messaging (/messages)

A high-fidelity social chat interface running on WebSocket-powered Supabase Realtime Channels. It supports live messaging, typing indicators, active presence status (WhatsApp style), the sharing of assets/posts directly into chats, legal templates sharing, and handshake token verification.

### Administrative Command Console (/admin)

A master back-office interface equipping authorized platform admins with tools to manually release or refund escrow files, bypass PostGIS spatial checks for sandboxed testing, and evaluate dispute documents.

### Navigation

Rentral features a clean, responsive top navigation bar designed for rapid viewport adjustments:
Marketplace    My Bookings    My Assets    Dashboard    Profile


The header layout remains consistent, ensuring fluid, zero-latency transitions on both desktop browsers and mobile touchscreens. No complex, screen-narrowing sidebars are utilized.

### Core User Flow

## 1. Verification and Onboarding

The user signs in via Google or Apple OAuth handled by superbase auth.
The system intercepts the session at Next.js edge middleware, routing unverified profiles to the /onboarding screen.
The user submits their NIN, BVN, or passport parameters, which are validated instantly against official registries via Didit.
Once approved, the user registers their unique username. Licensed agents and organizations can upload professional operating documents, routing files directly to the Gemini AI pipeline for authenticity auditing.

## 2. Mobile-First Walkthrough Listing

To create a listing, the operator must utilize a mobile browser terminal.
The user clicks "Create Listing" and selects their asset category (Property, Vehicle, or Boat).
The app natively activates the device camera using the HTML5 MediaDevices API. The user must capture a continuous 120-second walkthrough video of the asset.
Simultaneously, the browser silently captures high-accuracy GPS coordinates from the cellular chipset. These coordinates are locked as hardware_coordinates in the Supabase PostgreSQL database.
The user types the physical address. The system geocodes this address and converts it into address_coordinates to run a database-level distance validation query:
If , the asset's spatial legitimacy is verified.
The user inputs structural properties (e.g., bedrooms, vehicle transmission, vessel capacity) and sets the price.
Then they submit the corresponding document for the listen for example if its a property they submit the deed of assignment or prove of ownership and if its a vehicle they submit the vehicle particulars and if its a boat they submit the boat registration documents.
To activate the listing, the lister pays a small micro-payment (e.g., ₦1,000) through a dynamic OPay virtual account number, preventing remote bot spam.

## 3. Seekers: Interactive Discovery & Proximity Inspection

The seeker discovers the listing on the vertical-scrolling /marketplace.
The seeker commits an inspection fee (e.g., ₦3,000) directly into Rentral's master OPay escrow wallet, locking a viewing block. The system issues an encrypted one-time password (OTP) token.
On-site, the lister presents their check-in screen. The seeker scans the token.
The platform immediately calls browser geolocation APIs on both devices. A database PostGIS query verifies that both users are physically standing within a 20-meter radius of the property coordinates:
If validated, the ₦3,000 escrow is instantly payouts-routed to the lister's traditional bank account (e.g., GTBank).
If the lister no-shows, the seeker taps "Lister Absent". The system checks the seeker's GPS history, issues an automated refund, and flags the lister's reputation index.

## 4. Holding Deposits & Defaulter Splits

If a seeker loves the asset after inspection but requires a 24-hour window to liquidate the full lease funds, they can activate a "Holding Lock" by transferring a commitment fee (e.g., ₦20,000) via a dynamic virtual account.
The listing status instantly changes to on_hold in the database, initiating a strict 24-hour countdown timer.
If the seeker completes the total lease balance before the countdown hits zero, the ₦20,000 is credited toward their checkout.
If the timer expires, a Supabase Edge Function executes a split payout: Rentral retains a 30% processing surcharge (₦6,000), and routes the remaining 70% (₦14,000) directly to the landlord's traditional bank account. Landlords are paid for their wasted time, and Rentral captures pure high-margin profit. Seekers can pay proportional fees to extend the hold for multiple days.

## 5. Year 2 and other years Automated Churn Routing

During Month 11 of a lease, Rentral prompts the tenant to log their lease renewal reference code to maintain their Rentral Trust Score.
Before submitting, the tenant selects whether they paid the original agent or direct to the landlord.
The tenant pastes the unique bank reference code. Next.js API routes hit OPay/Paystack open banking APIs to cross-verify the specific transaction hash.
If verified, the tenant's trust score updates favorably, and the database updates the property status to "Directly Managed" if the agent was bypassed. This maintains absolute data fidelity for B2B data monetization. and then you repeat this process every year till the tenants lease expires or leaves the apartment.

## Data Architecture

To ensure speed and support high-volume geospatial telemetry queries, Rentral relies on a modular relational structure inside Supabase.

## Profiles Table (profiles)

Standard ID reference pointing to Supabase Auth UID
Personal details (full name, username, KYC metrics)
Computed lister reputation score (0.00 to 5.00)
Traditional banking parameters (bank code, account number) used for programmatic payout routing

## Listings Table (listings)

Asset classification identifiers (house, car, boat)
PostGIS geographic point coordinates (hardware-locked point vs. geocoded address point)
Verified document URLs (Certificate of Occupancy, vehicle logbooks, captain licenses)
Structured JSONB metadata payloads tracking bedrooms, transmission, and tenant preferences

## Transactions Ledger (transactions)

Relational mapping of seekers, listers, and listings
Payment ledger types (listing fee, inspection escrow, holding lock, total package)
Status checks (pending, successful, refunded, payout settled)
Administrative audit parameters (is admin override, override reason)

## Chat Messages Schema

Built to support high-fidelity communication over WebSocket state. Custom metadata JSONB columns track rich payloads like typing states, read indicators, and post sharing coordinates.
Thread mapping captures active chat relationships, automatically grouping interactions by active listing contexts to keep discussions focused on negotiations.

## Features In Scope

Unified onboarding and verification via Didit integration (NIN, BVN, Passport parsing).
Responsive, vertical-scrolling discovery feed styled in Tailwind CSS v4 featuring glassmorphism overlays and real-time trust alerts.
Browser-based camera recording framework with device telemetry capture.
Spatial verification check using PostGIS geography coordinate functions.
Dynamic Virtual Account generation for payment collections (OPay and Paystack integration).
Automated split payouts to traditional bank accounts for inspection handshakes and holding lock cancellations.
Multi-day holding deposit configurations with countdown tracking on database edge servers.
AI-driven document forgery auditing via Google Gemini-1.5-Pro, scanning land registry deeds and CAC certificates for alterations.
Recipient Route Verification system for Year 2 lease renewals to track agent bypass and update occupant trust ratings.
WebSocket-powered Instant Messaging Engine featuring Supabase Realtime Channels for low-latency chat, presence indicators (Online/Offline), typing indicators, and read receipts.
Interactive Direct-Share capability allowing users to share properties, vehicles, or boats as interactive card overlays directly inside chat threads, rendering real-time booking triggers right inside messages.
Admin Override console for dispute mitigation, manual escrow release, and staging sandbox testing.
Comprehensive PostHog events integration for search trends, default records, and conversion metrics.

## Features Out of Scope

Automatic filling of physical rental lease forms or vehicle booking contracts outside the platform.
Live streaming feeds of video recording uploads or active webcam sessions.
In-app digital wallet creation or fiat-to-cryptocurrency conversions.
Background checks or security clearances beyond national database registry verification via Didit.
Cover letter or tenant matching pitch templates for tenants.
Multi-tenant shared account ledgers for groups of friends.
Integration of Google Maps visual route optimization inside the list view (pure distance vectors only).
Automatic listing syndication to legacy classified websites.

## PostHog Events

Rentral tracks all high-intent operations to feed the B2B insights dataset and optimize client experience:
onboarding_kyc_completed: Fired when a user successfully passes Didit registry matching.
listing_hardware_locked: Tracks when a lister submits high-accuracy hardware coordinates with walkthrough media.
inspection_escrow_deposited: Triggered when an inspection fee is locked in Rentral's master wallet.
spatial_handshake_success: Captures when two devices successfully complete proximity OTP validation at listing coordinates.
holding_lock_activated: Tracks the initiation of the inventory freeze countdown.
holding_lock_expired: Logged when a seeker defaults on an active holding deposit, triggering a programmatic split.
year2_route_updated: Fired when a tenant updates their lease payment path during renewal checks.
message_sent_with_share: Triggered when an interactive listing card is directly shared inside a chat.
insights_portal_queried: Logged when an enterprise developer extracts predictive telemetry data.

## Target User

Rentral serves three distinct target groups:

### Seekers (Tenants and Renters)

Tech-savvy young professionals, business executives, and diaspora returnees in Lagos who demand premium, verified housing and mobility experiences without middleman exploitation.

## Listers (Hosts and Asset Owners)

Landlords, registered auto dealerships, certified boat captains, and licensed real estate agents who want to protect themselves from time-wasters and get compensated for scheduled viewings.

## Institutional Investors & Developers

Real estate developers, corporate planners, and construction firms seeking high-fidelity consumer trend data (search budgets, neighborhood demand volumes, and price elasticity) before committing capital.

## Success Criteria

A new user can complete onboarding, pass biometric KYC, and start renting in under five minutes.
Walkthrough listing captures prevent 100% of remote listing cloning and location spoofing scams.
Dual-device GPS checks confirm absolute physical presence before releasing inspection fees, eliminating viewing-associated fraud.
Supabase Edge Functions manage the 24-hour hold lifecycle with zero latency, splitting defaults cleanly.
WebSocket connections over Supabase Realtime scale dynamically, maintaining sub-100ms message delivery, status updates, and interactive listing shares.
Open banking APIs accurately verify bank transaction reference codes to update Year 2 and other years renewal paths.
All client telemetry, search vectors, and pricing break-points are collected anonymously in the database, forming the foundation of Rentral Insights. Thank you.
