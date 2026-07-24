## Progress Tracker

Update this file after every completed feature. Any AI agent reading this should immediately know what is done, what is in progress, and what is next.

## Current Status

Phase: Phase 1 — Foundation, Auth, & Core Infrastructure (with Profile UI pulled forward from Phase 7)
Last completed: 02 Auth, 03 KYC & Onboarding Pipeline (proxy.ts, Didit webhook, multi-step onboarding with ProfileForm, all 3 pipeline bugs fixed). Also: Marketplace Profile Page — Owner + Visitor UI (`/marketplace/profile`, `/marketplace/profile/[username]`), built ahead of schedule with real identity data (username/name/verification/account type from Prisma), real trust-stat counts via `getTrustSummary()` (with a `null`/"Coming soon" placeholder for the 3 metrics with no backing system yet), and a real empty state for listings until the Listing table exists. Profile is editable end-to-end: bio + avatar_url added to `User`, a public `profile-avatars` Storage bucket with owner-scoped RLS, live username-availability checking, Supabase secure (double-confirm) email change synced back to Prisma via `app/auth/callback/route.ts`, real Sign Out, and a Copy Link/WhatsApp/X/Facebook share menu.
Also: 05 Telemetry & PostHog Initialization — `posthog-js` client init (`instrumentation-client.ts`) + `posthog-node` server client (`lib/posthog.ts`, `flushAt: 1`, flush-per-call so events land before short-lived server actions/route handlers exit). 6 events wired to real code paths: `user_signed_in`/`user_signed_up` (sign-in actions), `verification_started` (onboarding `initiateVerification`), `verification_completed` (Didit webhook), `onboarding_completed` (`submitProfile`), `profile_updated` (`updateProfileIdentity`/`updateAvatarUrl`, tagged by `field`).
Also: Listing Capture — Full UI (build-plan.md Phase 2, Item 05). Wizard shell (Category → Walkthrough → Details → Documents → Activate → Done) now nested at `/marketplace/listing/create` (moved from a top-level `/listing/create` to match the `/marketplace/profile` convention), `useRentralStore` (Zustand) driving wizard state, category-specific metadata schemas (House/Car/Boat) in `lib/schemas.ts`. `CaptureCanvas` uses a real `getUserMedia` live preview; countdown, GPS-lock dot, document upload, and the ₦1,000 checkout screen are simulated local state — no `navigator.geolocation`, no DB writes, no Mux/Gemini/OPay calls yet.
Also: Listing Hub (`/marketplace/listing`) — "Your Listings" page reusing the existing `ListingsGrid`/`getListingsForProfile()` (previously only rendered on visitor profile views) plus a "Create Listing" CTA into the wizard. Sidebar (`MarketplaceSidebar`) and mobile bottom nav (`MarketplaceBottomNav`) "Listing" items — previously dead `href="#"` placeholders — now both route here instead of straight to the wizard. Homepage's "Create listing" CTA still goes directly to `/marketplace/listing/create`. Verified end-to-end with a headless Chrome + fake-camera-device Playwright run across both entry points (sidebar → hub → wizard, and homepage → wizard directly): real video frames rendered, correct routing at every hop, zero console errors. Also confirmed the existing `proxy.ts` auth gate correctly protects all of these routes (redirects unauthenticated visitors to `/sign-in`, then to `/marketplace`/`/onboarding` per profile state).
Also: 06 Spatial Integrity & Upload Logic (pragmatic slice — no Mux/OPay/Gemini keys yet). The wizard is now real end-to-end: `CaptureCanvas` records actual video via `MediaRecorder` (vp9→vp8→webm→mp4 codec fallback) gated on a real `navigator.geolocation` fix (recording is blocked entirely if location is denied — spatial invariant), with an in-player review of the recorded take, a Retake button, and a canvas-captured JPEG poster frame. Numeric metadata fields (bedrooms/bathrooms/sizeSqm/mileageKm/seats/capacityPersons/basePrice) are digits-only via zod regex + `inputMode="numeric"`. `DocumentUploadZone` holds the real `File` (type/size validated). On "I've Paid" (fee still simulated), the browser client uploads video/poster to the public `listings-media` bucket and the doc to the private `compliance-docs` bucket at `{uid}/{draftId}/...` (uid-first instead of architecture.md's `listings/{listing_id}/...` because the client uploads before the row exists and owner-folder RLS keys on the first path segment; server actions cap bodies at 1MB so media can't ride through the action). Then the `saveListing` server action (`app/actions/listingActions.ts`) re-validates with zod, checks path ownership, and in one transaction inserts the `Listing` row via Prisma + sets `hardware_coordinates` (PostGIS `geography(Point,4326)`, written via raw `ST_SetSRID(ST_MakePoint(...))` since Prisma treats geography as Unsupported — which also means Prisma can never SELECT it back to a client). Status starts at `pending_verification`; `listing_created` PostHog event fires. `getListingsForProfile(listerId)` is now a real Prisma query feeding "Your Listings" and visitor profiles (explicit select, never coordinates); wizard step 1 gained a "Back to Your Listings" exit link and the Done screen links to the hub. Migrations: `20260724100000_add_listing_model` (postgis extension, RLS-hardened Prisma-only table) + `20260724100500_add_listing_storage_buckets` (both buckets + owner-scoped policies).
Also: GPS capture hardening — camera/GPS require a secure context, so `pnpm dev:https` (`next dev --experimental-https`, mkcert-backed) was added for phone testing over the LAN (plain `http://192.168.x.x:3000` can never grant them; only localhost is exempt). `CaptureCanvas` now: shows a secure-connection explainer instead of a dead camera on insecure origins, pre-checks `navigator.permissions` for a hard "denied" (pill shows "GPS Blocked", clears live on unblock via the `change` event), maps `GeolocationPositionError.code` to specific instructions (denied → site settings; unavailable → OS Location Services; timeout → retry), and auto-falls back from high-accuracy GPS (15s) to network/Wi-Fi location (`enableHighAccuracy: false`, 20s, 60s cache) before surfacing an error — the path that actually succeeds on desktops.
Also: Marketplace Feed + Listing Editor + Drafts. (1) **Feed**: `app/marketplace/page.tsx` is now an async server component rendering real non-draft listings via `getMarketplaceFeed()` (`lib/listing-data.ts` — joins lister username/avatar/kyc, public Storage URLs, category-derived badges, "Pending Verification" badge until real verification lands); mock cards removed, real empty state with a Create CTA. `MarketplaceFeedCard` tolerates null avatar (initial fallback), null poster, null trustScore (hidden — no fabricated scores), and plays webm/mp4 via `src`. (2) **Drafts**: "Save Draft & Exit" appears in the wizard once a category is chosen (`SaveDraftButton`); it uploads any in-memory media to Storage (shared `lib/listing-upload.ts`, timestamped filenames under a stable `{uid}/{mediaFolderId}/` folder) and upserts via the `saveDraft` action (`listing_status='draft'`, `wizard_step` saved for resume, coords stored server-side only). Draft columns are nullable with a `Listing_posted_complete_check` DB CHECK forcing completeness for any non-draft status — save/post transactions write fields while status='draft', set PostGIS coords, then flip status last (verified against the live DB in both directions). Resume: "Continue Editing" on the hub card → `/marketplace/listing/create?draft=<id>` → server-fetched `DraftPayload` (never raw coordinates — only a `hasCoords` boolean) hydrates the Zustand store; CaptureCanvas previews the uploaded take from Storage and treats server-held GPS as locked; retake clears both. (3) **Editing**: `/marketplace/listing/[id]/edit` (ownership-scoped 404, drafts redirect to the wizard) → `ListingEditForm` edits metadata/address/price only — video/GPS/documents stay padlocked per Item 11 — via the `updateListing` action. Shared `ListingFields` fieldset now powers both the wizard details step and the edit form. Hub (`/marketplace/listing`) shows drafts + owner-only Edit/Continue buttons (`ListingsGrid`/`ListingCard` `owner` prop); visitor profiles exclude drafts.
Next: finish Item 08's Mux transcoding leg, Item 09 Gemini doc audit, Item 10 real OPay ₦1,000 fee (still stubbed: storage-direct playback, `pending_verification` status, simulated payment). Follow-ups: GC for replaced draft media objects; Feed "Book"/like/save buttons are still local-only UI.

## Progress

### Phase 1 — Foundation, Auth, & Core Infrastructure

[x] 01 Homepage & Navigation — Full UI (Hero, Value Prop, Trust Loop)

[x] 02 Authentication & Middleware Protection (Supabase Auth, proxy.ts Edge interception, sign-in/sign-up flows, OAuth callback)

[x] 03 KYC & Identity Resolution (Didit NIN/BVN/Passport Webhook, multi-step onboarding: account type → KYC → profile form → username → marketplace)

[x] 04 Database Schema & Prisma Setup (User, IndividualProfile, OrganizationProfile, WebhookLog models)

[x] 05 Telemetry & PostHog Initialization (Client & Server-side flush setup)

## Phase 2 — Hardware-Locked Inventory & AI Audits

[x] 06 Mobile-First Capture UI (WebRTC Camera & HTML5 Geolocation hooks — real MediaRecorder + GPS-gated capture with retake)

[x] 07 Dynamic Spatial Metadata Forms (Category-specific: House, Car, Boat — digits-only validation, persisted to `Listing.asset_metadata`)

[~] 08 Media Transcoding & Ingestion (Supabase Storage leg done: `listings-media`/`compliance-docs` buckets + upload flow; Mux transcoding pending API keys)

[ ] 09 AI Document Verification Pipeline (Gemini 1.5 Pro Title/CAC Audit)

[ ] 10 Pay-Per-Post Spam Gate (OPay Virtual Account for Listing Fee)

[ ] 11 Listing Editor (Padlocked spatial/media attributes)

## Phase 3 — Discovery Feed & Multi-Asset Search

[ ] 12 Discovery Feed UI (Vertical Mux scroll, Glassmorphic overlays, badges)

[ ] 13 Feed Logic & Spatial Querying (TanStack Query, PostGIS ST_Distance Math)

[ ] 14 Parametric Filtering & Search Engine (Category, Budget, Amenities)

[ ] 15 Peer Reviews & Reputation System (Trust Score calc, Red Warning Banners)

[ ] 16 Dispute & Appeals System (For flagged listers to appeal warnings)

## Phase 4 — Transaction Pipelines & Escrow Settlement

[ ] 17 Proximity Handshake UI (Seeker OTP Scanner, Lister Check-in View)

[ ] 18 Residential Inspection Settlement (ST_DWithin 20m check -> OPay Payout)

[ ] 19 Direct Booking Settlement Flow (Shortlets/Cars/Boats upfront multi-day logic)

[ ] 20 Holding Lock Activation UI & 24-Hour Inventory Freeze

[ ] 21 Default Monetization Engine (Supabase Edge Function for 70/30 split payout)

## Phase 5 — Unified Messaging & AI Lifestyle Engine

[ ] 22 Real-Time Negotiations (Supabase Realtime WebSockets Chat UI & Logic)

[ ] 23 Interactive Direct-Share (Embedded asset cards with booking triggers in chat)

[ ] 24 AI "Squat-Mate" Matching (Gemini conversational agent for co-living matches)

## Phase 6 — Continuous Lifecycle & Retention

[ ] 25 Automated Notification Engine (Month 11 renewal pulses, escrow alerts)

[ ] 26 Year 2 Continuous Trust Routing (Paystack/OPay Open Banking Hash validation)

[ ] 27 Lease Termination & Asset Unfreezing (Gemini Move-Out / Vacancy Deed Audit)

## Phase 7 — Admin Command Center & B2B Insights

[ ] 28 Profile & Trust Ledger Dashboard (Active inventory, bookings, score history)

[ ] 29 Rentral Insights B2B Portal (Demand heatmaps, price elasticity, churn data UI)

[ ] 30 Administrative Master Console (Force Escrow Release, Force Refund, Dispute UI)

[ ] 31 Sandbox & Developer Bypass Flags (is_admin, admin_bypass_verification logic)

---

## Decisions Made During Build

_Framework & UI: Utilizing Next.js 16 (App Router) and React 19. All styling is executed via Tailwind CSS v4 using semantic utility classes (@theme)._

_Zero-Trust Spatial Security: Listings must be created on a mobile web interface to capture raw navigator.geolocation simultaneously with the WebRTC video. Desktop uploads of stock imagery are programmatically blocked._

_Database & Proximity Math: Supabase (PostgreSQL) is the core database, heavily utilizing the PostGIS extension. Physical handshakes are verified natively at the database level using ST-DWithin (strict 20-meter radius)._

_Financial Routing: Operating a split-escrow architecture. We generate OPay/Paystack dynamic virtual accounts for inbound funds and use their Transfer APIs to route net payouts directly to landlords' traditional bank accounts (no digital wallet required for hosts)._

_AI Gatekeeper: Google Gemini 1.5 Pro is used strictly as a multi-modal forensic auditor for Title Deeds, CAC documents, and Vacancy Deeds, expecting strictly parsed JSON responses._

_B2B Analytics First: PostHog is integrated at the server level (flushAt: 1) to capture all search patterns, checkout dropouts, and spatial defaults to feed the B2B 'Rentral Insights' portal._

_Error Monitoring: Oluso (@oluso/nextjs) is wired through root `instrumentation.ts` — `register()` installs uncaughtException/unhandledRejection handlers and `onRequestError` catches server-side errors from Server Components, Route Handlers, Server Actions, and Proxy on both Node and Edge runtimes. API key lives in `.env` as OLUSO_API_KEY (gitignored); `environment: process.env.NODE_ENV` keeps dev errors from triggering notification emails or auto-fix PRs._

_State Management: Used Zustand (useRentralStore) for transient multi-step wizard states (video recording, dynamic forms, and checkout configurations) to prevent unnecessary DB writes before the user commits._

---

## Notes

_Spatial Privacy Invariant: Never expose raw hardware coordinates (hardware-coordinates) to the client-side frontend. Only expose computed distances (distance-meters) or abstracted neighborhood zones._

_Supabase Client Contexts: Strictly separate @supabase/ssr browser clients (read-only) from server clients. Webhooks and edge functions executing financial payouts or CRON updates must use the SUPABASE-SERVICE-ROLE-KEY to bypass RLS safely._

_Currency Handling: Always multiply NGN values by 100 before sending to OPay/Paystack APIs (they operate in Kobo). Always divide by 100 when reading from webhooks._

_Admin Security: The admin-bypass-verification and is-admin-override flags must always be guarded by a strict backend check validating profiles.is-admin = true to prevent production exploitation during staging/testing._

_Holding Lock Split: When a 24-hour holding lock expires, the Edge Function must programmatically distribute 30% to the platform and 70% to the asset owner's bank account before resetting the listing to 'active'._

_Listing Capture Boundary (updated with Item 06): recording, GPS, storage uploads, and the DB write are real. Still simulated/deferred pending API keys: the ₦1,000 OPay fee (button confirms without payment), Gemini document audit (docs land in `compliance-docs` unreviewed), and Mux transcoding (cards play the raw Storage file). Listings therefore stay `pending_verification` — nothing auto-activates. Wizard blobs live only in Zustand memory, so a refresh at checkout requires redoing capture/document steps (guarded with a clear error, no orphan rows; failed saves best-effort delete their uploads)._

