## Rentral Library Docs & Integration Patterns

### Current Implementation Corrections (2026-09-24)

Build correction (2026-11-07): `pnpm build` explicitly runs `prisma generate`
before Next.js. Never rely on an existing local `.prisma/client` or dependency
postinstall behavior. Prisma config omits its optional datasource when DIRECT_URL
is absent, allowing code generation without database credentials. Migration
commands still require a configured datasource and are not part of the build.
Node24.x is selected in package.json to match the supported local/runtime major.

Use `context/production-plan.md` for the current architecture. The snippets below include historical APIs and must be verified against current provider documentation before implementation.

- Auth uses `proxy.ts` and `lib/proxy.ts`, with `lib/server.ts` (request cookies/publishable key), `lib/client.ts` (browser) and `lib/admin.ts` (service role). Redirect responses must preserve refreshed cookies. `getUser()` supplies current server-owned metadata; protected mutations also check database eligibility.
- Didit endpoint: `/api/webhooks/didit`, not `/api/webhooks/smile-id`. Approval binds to the recorded session/workflow. The legacy `/api/verify` endpoint now delegates to the onboarding session action so it cannot skip persistence or verification guards.
- Prisma is the current database access layer; parameterized raw SQL handles unsupported PostGIS columns. Private tables deny Data API access. Browser Storage uploads are allowed through owner-scoped policies.
- PostHog uses a reusable singleton with per-call flush, not shutdown of a shared client. Local/test telemetry is opt-in via `NEXT_PUBLIC_POSTHOG_ENABLED=true`; production remains enabled with a configured token unless explicitly set to `false`. Server delivery uses a 1.5-second request timeout and no retries so analytics outages cannot hold login for the SDK's default retry window.
- Sign-in discovers Google/Apple availability from Supabase's public Auth settings, with a three-second timeout and email-only fallback. Disabled providers are not offered. Auth failures use allowlisted messages, not raw provider errors; a missing user after sign-in is never treated as success.
- Mux uses pinned `@mux/mux-node` 15.2.0 and `@mux/mux-player-react` 3.13.4. Use `inputs` and `playback_policies` (plural); await `webhooks.unwrap` before parsing. All asset creation has retries disabled, 15-second timeouts and persistent correlation. Playback tokens expire after 15 minutes. See `media-plan.md` and `media-staging.md`; historical public-playback snippets below are not the current implementation.
- Media background processing uses POST `/api/internal/media-worker`, gated by `MEDIA_WORKER_ENABLED`, the Mux gate/configuration, and a separate `MEDIA_WORKER_SECRET`. Queue claims compare the observed attempt; reconciliation uses a timestamp compare-and-swap and never creates replacement assets for uncertain submissions. The route has its own secret authorization and bypasses browser-session middleware only at that exact path. External scheduling and staging acceptance remain required.
- Vitest is approved for isolated TypeScript regression tests; Playwright for real Next.js route/viewport checks. The configured browser channel is installed Chrome. No production identities or provider charges belong in automated tests.
- Saved listing media uses the authenticated `/api/listings/:id/source` redirect,
  with owner/active authorization before service-role signing and five-minute URLs.
  Protected posters use Next Image `unoptimized`. The private-bucket migration is
  prepared, not deployed; see `private-media-plan.md`. `pnpm test:storage` uses a
  disposable local PostgreSQL cluster and never the configured application database.
- Installed Supabase/Postgres and Tailwind skills are references; examples for unrelated projects, Tailwind v3 configs, and obsolete Gemini/provider endpoints do not override this app's Tailwind v4 tokens or verified provider contracts.

This document serves as the absolute, definitive architectural guide for implementing every third-party library and SDK within the Rentral marketplace. Because Rentral operates as a zero-trust, spatially locked financial infrastructure for the African digital economy, generic implementations of these libraries will introduce severe vulnerabilities.

Every engineer and AI agent operating on this codebase must read the relevant section thoroughly before writing any code that touches these systems.

## 0. Universal Implementation Rules

Before utilizing any third-party service, you must adhere to the following strict hierarchy of authority:

Check AGENTS.md: Always verify the project root AGENTS.md to see which MCP servers and agent skills are actively installed.

Prioritize MCP Servers: If an MCP server is configured for a tool (e.g., Supabase, PostHog, Stripe/OPay), query it to read live documentation or database schema states before falling back to generalized training data.

Strict Adherence to this Document: The patterns defined here override general library knowledge.

Order of Authority: MCP Server (Real-time) → Skills via AGENTS.md → This Document (Project Rules) → General Training Knowledge.

## 1. Supabase & PostGIS (@supabase/ssr & @supabase/supabase-js)

Rentral relies entirely on Supabase for data persistence and the PostGIS extension for spatial mathematical locking.

## 1.1 Client vs. Server Context Isolation

We maintain three strictly separated Supabase instances. Never cross-contaminate them.

## Browser Client (Client Components Only):
Used exclusively for read-only operations on public feeds or subscribing to Realtime WebSocket chat channels.

// lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );


## Server Client (Server Components, Actions, User API Routes):
Used when executing authenticated actions on behalf of the user. Automatically parses Supabase Auth cookies.

// lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const createClient = async () => {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
};


## Admin / Service Role Client (Webhooks & Edge CRONs Only):
Used strictly in /api/webhooks/* or Supabase Edge Functions where Row Level Security (RLS) must be bypassed to execute automated financial settlements or multi-year lease updates.

// lib/supabase/admin.ts
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export const createAdminClient = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );


## 1.2 Executing PostGIS Spatial Queries

## Supabase JS does not natively support raw SQL geometry insertions. All PostGIS spatial math (ST_DWithin, ST_MakePoint) must be executed via pre-defined Remote Procedure Calls (RPCs).

## Inserting Spatial Data (Listing Creation):
When saving a listing, pass the raw coordinates from navigator.geolocation directly to the RPC.

const { data, error } = await supabase.rpc('insert_listing_with_postgis', {
  p_lister_id: userId,
  p_category: 'house',
  p_base_price: 5000000,
  p_longitude: lng, 
  p_latitude: lat,
  p_lease_duration_years: 1 // Default, can be overridden by multi-year config
});


## Validating Proximity (The Spatial Handshake):

const { data: isWithinRange, error } = await supabase.rpc('verify_handshake_proximity', {
  p_listing_id: listingId,
  p_seeker_lng: currentLng,
  p_seeker_lat: currentLat,
  p_radius_meters: 20 // STRICT SYSTEM CONSTANT: 20 meters
});


## Rules for Supabase/PostGIS:

Never expose raw hardware_coordinates to the client-side frontend. Abstract it to neighborhood zones or distance_meters.

Always handle the error return object.

Always scope queries using .eq('id', userId) even with RLS enabled to prevent accidental cross-pollination in complex joins.

## 2. Supabase Authentication (@supabase/ssr)

Rentral relies on Supabase Auth for the initial authentication loop, generating the base userId that maps exactly to our Supabase profiles table.

## 2.1 Edge Middleware Protection

Supabase Auth acts as our primary route firewall. Unauthenticated users are strictly barred from transaction interfaces.

// middleware.ts
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/checkout(.*)', 
    '/listing/create(.*)', 
    '/listing/edit(.*)', 
    '/profile(.*)',
    '/messages(.*)'
  ],
}


## 2.2 Retrieving User Identity

In Server Actions, always use getUser() to extract the ID securely.

import { createClient } from "@/utils/supabase/server";

export async function processHoldingLock(listingId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const userId = user.id;
  
  // Proceed to use userId as seeker_id in transactions
}


## 3. Didit Identity Verification (@didit-protocol/sdk-web)

Because Rentral operates high-value escrows, Supabase Auth identity alone is insufficient. Users must pass Didit KYC (NIN, BVN, or Passport).

## 3.1 Webhook Resolution

Didit processing is asynchronous. Never block the UI waiting for KYC. Instead, rely on the webhook.

Route: app/api/webhooks/smile-id/route.ts

Logic: When Didit fires a KYC_APPROVED payload, use the createAdminClient() to update the Supabase profiles table, flipping kyc_status from 'pending' to 'verified'.

## 4. Google Gemini 1.5 Pro (@google/generative-ai)

We utilize Gemini 1.5 Pro exclusively as an automated, multimodal forensic compliance auditor. It evaluates Deeds of Assignment, Certificates of Occupancy, and Mutual Lease Termination documents.

## 4.1 Structured Forensic Analysis

We strictly enforce JSON responses and low temperatures to prevent hallucination.

// lib/gemini.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function analyzeDocumentWithGemini(base64Image: string, mimeType: string) {
  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-pro",
    generationConfig: {
      temperature: 0.1, // Highly deterministic for strict forensic analysis
      responseMimeType: "application/json",
    }
  });

  const prompt = `You are a forensic real estate document auditor in Nigeria.
  Analyze the provided document (C of O, CAC, or Vacation Deed).
  Detect signs of digital manipulation, inconsistent fonts, mismatched dates, or AI generation.
  
  Return STRICTLY valid JSON matching this schema:
  {
    "authentic": boolean,
    "confidenceScore": number (0 to 100),
    "documentType": string,
    "findings": string[] (Array of detected anomalies or confirmations)
  }`;

  const imagePart = {
    inlineData: { data: base64Image, mimeType: mimeType }
  };

  try {
    const result = await model.generateContent([prompt, imagePart]);
    return JSON.parse(result.response.text());
  } catch (error) {
    console.error("Gemini Forensic Parse Error:", error);
    return { authentic: false, confidenceScore: 0, findings: ["AI System Failure"] };
  }
}


## Rules for Gemini:

Never use Gemini for conversational chatbots in this specific application layer. It is a gatekeeper.

Always handle potential JSON.parse failures gracefully.

If confidenceScore is below 85, automatically flag the document for human administrative review.

## 5. Financial Escrow Routing (OPay & Paystack)

Rentral routes billions of Naira through split-escrow mechanisms. OPay handles dynamic virtual accounts and outbound transfers for Nigeria. Paystack is utilized for Open Banking hash validations during Year 2+ lease renewals.

## 5.1 OPay Virtual Account Generation

Triggered when a user locks an inspection, holding deposit, or multi-year lease.

// lib/opay.ts
export async function createVirtualAccount(transactionId: string, amountNgn: number, email: string) {
  const response = await fetch("[https://api.opay.com/v1/virtual-accounts](https://api.opay.com/v1/virtual-accounts)", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPAY_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reference: transactionId,
      amount: amountNgn * 100, // MANDATORY: OPay operates in Kobo
      currency: "NGN",
      customer_email: email,
      expires_in: 60 // minutes
    })
  });

  if (!response.ok) throw new Error("Failed to provision OPay Virtual Account");
  return await response.json();
}


## 5.2 Paystack Open Banking Hash Validation

Used specifically for the Continuous Trust Renewal loop (Year 2, Year 3, etc.) when tenants bypass agents.

// lib/paystack.ts
export async function verifyRenewalTransferHash(referenceHash: string) {
  const response = await fetch(`https://api.paystack.co/transaction/verify/${referenceHash}`, {
    headers: {
      "Authorization": `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
    }
  });
  
  const data = await response.json();
  // Validates if the recipient bank account matches the registered Landlord's account
  return data.data; 
}


## Rules for Financial APIs:

Kobo Conversion: Always multiply NGN by 100 before sending to OPay/Paystack. Always divide by 100 when reading from webhooks.

Webhook Security: Never process an OPay or Paystack webhook without cryptographically verifying the signature header (x-opay-signature or x-paystack-signature) against our secret keys.

No P2P: All initial transaction flows MUST pass through Rentral's Master Ledger.

## 6. Video Ingestion & Transcoding (@mux/mux-node & @mux/mux-player-react)

To support users on restricted bandwidth networks across Africa, we use Mux for signed HLS adaptive streaming.

## 6.1 Backend Ingestion

After the video_raw.mp4 is saved to Supabase Storage, a Server Action passes the public URL to Mux.

import Mux from '@mux/mux-node';
const mux = new Mux({ tokenId: process.env.MUX_TOKEN_ID, tokenSecret: process.env.MUX_TOKEN_SECRET });

export async function ingestWalkthroughVideo(supabaseUrl: string) {
  const asset = await mux.video.assets.create({
    input: supabaseUrl,
    playback_policy: ['public'],
    video_quality: 'basic' // Optimize for mobile networks
  });
  return asset.playback_ids[0].id; // Save this ID to the listings table
}


## 6.2 Frontend Playback

import MuxPlayer from "@mux/mux-player-react";

export function FeedPlayer({ playbackId }: { playbackId: string }) {
  return (
    <MuxPlayer
      streamType="on-demand"
      playbackId={playbackId}
      autoPlay="muted"
      loop
      className="object-cover w-full h-full rounded-[32px]"
    />
  );
}


## 7. Telemetry & Predictive Analytics (posthog-js & posthog-node)

PostHog is the backbone of our B2B 'Rentral Insights' portal, tracking geospatial demand elasticity.

## 7.1 Client-Side Initialization

// instrumentation-client.ts (Next.js App Router convention — not lib/posthog-client.ts)
import posthog from "posthog-js";

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  defaults: "2026-05-30", // bundles autocapture, pageview/pageleave, session recording
  capture_exceptions: true,
});

Note: the `defaults` bundle autocaptures pageviews out of the box. There is no manual pageview trigger in this project — if page-level funnels need to exclude noise later, override with `capture_pageview: false` and call `posthog.capture('$pageview')` manually at that point.


## 7.2 Serverless Environment Tracking (CRITICAL)

In Server Actions, API routes, or Supabase Edge Functions, use flushAt: 1 and flush() per call — not a per-call factory + shutdown(). `shutdown()` permanently closes the client, which breaks every subsequent call on a reused instance, so this project uses one module-level singleton for the life of the server process and flushes after every capture instead.

```ts
// lib/posthog.ts
import { PostHog } from "posthog-node";

const posthogServerClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  flushAt: 1, // MANDATORY: Next.js functions spin down instantly
  flushInterval: 0,
});

export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
): Promise<void> {
  try {
    posthogServerClient.capture({ distinctId, event, properties });
    await posthogServerClient.flush(); // Forces event queue dispatch before lambda death
  } catch (error) {
    console.error(`[posthog] Failed to capture "${event}":`, error);
  }
}

// Usage inside an action:
await captureServerEvent(userId, "profile_updated", { field: "identity" });
```


## Required PostHog Events:

See `code-standards.md` → "PostHog Telemetry Events" for the current list, split into Phase 1 (implemented) and Phase 2+ (future — no backing system yet).

## 8. Client State Management (zustand)

We use Zustand to persist complex UI flows that should not hit the database until finalized, such as the multi-step mobile camera capture and the Multi-Year Escrow configurator.

## 8.1 Rentral Global Store

// store/useRentralStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface RentralState {
  activeListingId: string | null;
  activeBookingDurationYears: number;
  adminBypassEnabled: boolean; // Sandbox usage only
  setActiveListing: (id: string | null) => void;
  setBookingDuration: (years: number) => void;
  toggleAdminBypass: (enabled: boolean) => void;
  resetCheckout: () => void;
}

export const useRentralStore = create<RentralState>()(
  persist(
    (set) => ({
      activeListingId: null,
      activeBookingDurationYears: 1, // Defaults to standard 1 year
      adminBypassEnabled: false,
      setActiveListing: (id) => set({ activeListingId: id }),
      setBookingDuration: (years) => set({ activeBookingDurationYears: years }),
      toggleAdminBypass: (enabled) => set({ adminBypassEnabled: enabled }),
      resetCheckout: () => set({ activeListingId: null, activeBookingDurationYears: 1 })
    }),
    { name: 'rentral-client-state' }
  )
);


## Rules for Zustand:

Do not duplicate database state in Zustand. Only store ephemeral session data, wizard progression, or configuration overrides.

Use the persist middleware sparingly. Ensure sensitive data (like un-hashed OTPs) is never persisted to localStorage.

## 9. RENTRAL DATABASE SCHEMA (The Integrity Engine)

The Rentral database is not a passive data store; it is an active, zero-trust "Integrity Engine." By leveraging Supabase (PostgreSQL) and PostGIS, the schema enforces spatial realities, financial compliance, and identity verification at the row level.

The following notes define the foundational structures of this engine, specifically detailing how human and corporate identities are managed to prevent the ghost-listing and agent-fraud epidemics prevalent in the African real estate and mobility markets.

## 9.1 DATABASE ENTITIES: CORE STRUCTURES

The core architecture relies on a unified ledger. A single, mathematically verified identity must be able to seamlessly lease a co-living space, rent a vehicle, and book a marine vessel without redundant verification or fragmented trust scores.

## 9.1.1 CORE TABLES: USER IDENTITY & ROLES (profiles table)

The profiles table is the central source of truth for all actors on the platform (Seekers, Listers, Licensed Agents, and Enterprise Organizations). It is strictly synchronized with Supabase Auth and acts as the gatekeeper for all financial and spatial operations.

## A. Primary Identification & Authentication Mapping

id (text, Primary Key): * Architecture Note: This strictly mirrors the userId generated by Supabase Auth. We do not generate custom UUIDs for primary identification. By using the Supabase Auth UID as the primary key, we guarantee a 1-to-1 mapping between the edge-authenticated session and the database row, enforcing Row Level Security (RLS) policies flawlessly.

username (text, Unique): * Architecture Note: The public-facing handle chosen by the user during the onboarding wizard. Used for public routing (e.g., rentral.com/@username) and masking actual names in public reviews for privacy.

country_code (text): * Architecture Note: Defaults to 'NG' (Nigeria). Ensures platform readiness for Pan-African scaling (e.g., 'KE', 'ZA') by allowing localized query filtering and payment gateway dynamic routing (OPay for NG, Paystack for wider regions).

## B. KYC & Regulatory Compliance (Didit Integration)

full_name (text, Not Null): * Architecture Note: Must perfectly match the legal name returned by the Didit registry check. Users cannot arbitrarily edit this field to prevent identity spoofing.

kyc_status (kyc_state Enum): * States: 'unverified', 'pending', 'verified', 'flagged'.

Architecture Note: No user can create a listing, lock an escrow, or perform a spatial handshake unless this state evaluates to 'verified'. This state is mutated exclusively by backend server actions listening to async Didit webhooks.

id_type (text): * Constraints: Locked to 'NIN', 'BVN', or 'PASSPORT'.

id_number (text): * Architecture Note: The encrypted string of the national identifier. Stored securely and only visible to internal compliance administrative roles.

## C. Role-Based Access Control (RBAC)

role (user_role_type Enum): * States: 'user', 'licensed_agent', 'organization'.

Architecture Note: Dictates UI permissions and verification badge rendering on the frontend discovery feed. A 'user' is a standard peer-to-peer participant, whereas agents and organizations unlock bulk-listing management tools.

is_admin (boolean, Default false): * Architecture Note: The ultimate system override flag. Only granted to Rentral internal staff. Permits bypassing of PostGIS spatial coordinate checks (for sandbox testing) and authorizes the manual force-release/refunding of locked escrows in the /admin console.

## D. Corporate & Professional Verification (Gemini AI Audit)

cac_registration_number (text): * Architecture Note: Mandatory if the user selects the 'organization' role (e.g., Enterprise Fleet Operators, Real Estate Developers).

license_document_url (text): * Architecture Note: Mandatory if the user claims the 'licensed_agent' role. Points to the Supabase Storage bucket holding their professional credentials.

is_business_verified (boolean, Default false): * Architecture Note: This flag is flipped to true exclusively by the Gemini 1.5 Pro AI verification pipeline. Once Gemini scans the CAC or license document for typographic anomalies or digital alterations and confirms authenticity, this flag unlocks the coveted blue/green verification badges on the frontend.

## E. Financial Routing Ledger (The NIP Gateway)

bank_code (text): * Architecture Note: The Central Bank of Nigeria (CBN) routing code for the user's traditional commercial bank (e.g., Access, GTBank, Zenith).

account_number (text): * Architecture Note: The 10-digit NUBAN.

Integration Rule: We do not force Listers to download OPay. When an escrow completes via the PostGIS handshake, Rentral's backend dynamically hits the OPay/Paystack Payout API using these two columns to automatically disburse the net platform funds to the user's legacy bank account.

## F. The Trust & Reputation Metric

reputation_score (numeric(3,2), Default 5.00): * Constraints: Min 0.00, Max 5.00.

Architecture Note: The core of the "Rentral Trust Score." This is a dynamic integer. It decreases if a user defaults on an inspection handshake (no-show) and increases via consistent multi-year lease renewals (verified via Open Banking hashes). If it drops below 3.50, the UI automatically renders a high-visibility red warning banner on all of the user's active listings.

created_at (timestamp with time zone): * Architecture Note: Immutable timestamp generated by the database upon profile insertion.

## 9.1.2 Implementation Invariants for Identity

To guarantee the structural integrity of the profiles table, all engineers must strictly adhere to the following rules:

Supabase Auth Trigger Synchronization: The initial INSERT into the profiles table is never triggered directly from the frontend React client. It should be triggered exclusively by a secure auth.users trigger running directly in the Supabase database.

Row Level Security (RLS) Dominance: The profiles table must have an absolute RLS policy enforced. Users can only SELECT or UPDATE their own rows (auth.uid() = id). All public profile fetches (for viewing a lister's reputation) must be explicitly handled via restricted, read-only database views or specific edge functions, stripping out PII (like account_number and id_number).

No Client-Side KYC Mutations: A frontend client MUST NEVER pass a payload to update the kyc_status or is_business_verified columns. These columns are mathematically protected and can only be updated by the SUPABASE_SERVICE_ROLE_KEY operating in secure backend routes after receiving validated payloads from Didit or the Gemini AI engine.

### 2026-11-07 implementation contracts

- GSAP3.14.2 is approved for scoped homepage animation with cleanup and reduced-motion.
- New domain services live in lib/bookings, payments, messaging, operations, listings,
  identity and analytics; web actions and /api/v1 reuse them. New table access gates
  on RENTRAL_PLATFORM_ENABLED until migration acceptance.
- Didit ordering requires DIDIT_ORDERING_ENABLED after migration160000. Signed
  body/header timestamp agreement and created_at ordering replace unsigned freshness.
- Paystack collection uses native REST and verified signed callbacks; exact provider,
  user, reference, currency and kobo must bind. Actual refunds/payouts are not implemented.
- Gemini REST model is explicit configuration; structured signals never auto-approve.
  Geoapify address results require precise high-confidence building matches, then PostGIS.
- Native consented Insights uses coarse enums and minimum ten-person groups; no raw
  search strings, identity details or coordinates. PostHog is optional and off in staging.
- Lifecycle POST worker authenticates a separate bearer secret, expires holds without
  inventing payouts, creates idempotent reminders, optionally uses Resend and prunes
  native search events90days. Reconcile uncertain email outcomes deliberately.
- Use pnpm staging for explicit .env.staging isolation; keep the example blank.
  See staging-setup.md, identity-review.md, mobile-api.md and release-readiness.md.
