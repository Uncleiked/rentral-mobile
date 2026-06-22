## Rentral Code Standards

Implementation rules and strict conventions for the Rentral marketplace. Any AI agent or engineer operating on this codebase must adhere to these guidelines without exception. These rules prevent pattern drift, enforce spatial security, and maintain the integrity of our zero-trust architecture.

## Engineering Mindset & Spatial Security

The AI agent and engineers on this project operate as senior PropTech & Data infrastructure experts. This means:

Spatial Integrity is Absolute — Never allow a listing to be created without raw navigator.geolocation data. Never expose raw hardware_coordinates to the client-side frontend; only expose computed distances.

Think Before Implementing — Understand the financial and physical routing consequences of the feature before writing a line of code. Always verify against architecture.md and build-plan.md.

Strict Scope — Build only what the current feature phase dictates. Do not wire backend Supabase mutations if the UI is not 100% complete and visually tested with mock data.

Fail-Safes for Financials — Wrap all OPay/Paystack API calls and Supabase Edge Functions in aggressive try/catch blocks. A failed webhook must never result in a silent success state.

Clean Over Clever — Simple, readable code that a junior developer can audit is preferred over clever, heavily abstracted logic.

One Feature at a Time — Complete one architectural milestone fully before attempting the next.

## TypeScript Conventions

Strict Mode — Enabled in tsconfig.json. No exceptions.

No any — Use unknown and narrow the type using type guards.

No Type Assertions — Avoid using as SomeType unless interacting with a strictly untyped third-party library, and always comment why.

Explicit Typing — All function parameters and return types must be explicitly typed, particularly for Supabase database responses and PostGIS geography payloads.

Types vs. Interfaces — Use type for object shapes, unions, and database row definitions. Use interface only for extendable React component props.

Async/Await — All async functions must have proper error handling. Never let Promises float unhandled.

Variable Declarations — Use const by default. Only use let when reassignment is mathematically necessary (e.g., calculating multi-year lease multipliers).

## Next.js 16 (App Router) & React 19 Conventions

App Router Only — The pages/ directory is strictly forbidden.

React 19 APIs — Leverage modern hooks and Server Actions.

Server Components by Default — All components default to running on the server.

Judicious "use client" — Only add "use client" when the component specifically requires:

useState, useReducer, or Zustand (useRentralStore).

Browser APIs (navigator.geolocation for spatial locks, window for Mux streaming).

Event listeners (onClick, onChange).

Client-only wrappers (PostHog provider, Supabase hooks).

Layout Immutability — Never add "use client" to root layout files.

Data Fetching — Read data in Server Components via @supabase/ssr. Never execute direct database fetches inside Client Components.

Route Handlers — Live in app/api/. These are reserved for webhooks (OPay, Didit) and AI orchestration (Gemini). Do not put complex business logic inline; extract it to utility functions.

Server Actions — Live in app/actions/. Use these strictly for UI-triggered mutations (e.g., saving a listing, initiating an escrow setup).

##File and Folder Naming

Folders — kebab-case (e.g., escrow-setup, continuous-renewal).

Component Files — PascalCase (e.g., DiscoveryFeedCard.tsx, MultiYearConfigurator.tsx).

Utility Files — camelCase (e.g., opayEngine.ts, spatialMath.ts).

Type Files — camelCase (e.g., platform.ts, database.ts).

API Routes — Always named route.ts.

Server Actions — camelCase (e.g., listingActions.ts, escrowActions.ts).

Component Structure — Strictly one component per file. Never export multiple React components from a single file.

## Component Structure

Every React component must follow this exact structural hierarchy:

"use client"; // Only if interactivity or browser APIs are required

// 1. External imports
import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";

// 2. Internal imports
import { useRentralStore } from "@/store/useRentralStore";
import { Button } from "@/components/ui/button";

// 3. Type definitions
type Props = {
  listingId: string;
  baseRentAmount: number;
};

// 4. Component Definition
export function MultiYearConfigurator({ listingId, baseRentAmount }: Props) {
  // state hooks
  // derived calculations (e.g., baseRentAmount * selectedYears)
  // action handlers
  // return JSX
}


Named Exports — Never use default exports for components (except for Next.js page/layout requirements).

Prop Definitions — Defined directly above the component.

Styling — No inline styles. All styling is executed via Tailwind CSS v4 using semantic utility classes.

## API Route Handlers (Webhooks & AI)

// app/api/verify/document-upload/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeDocumentWithGemini } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // 1. Validate body (ensure document URL and docType exist)
    // 2. Execute AI logic via isolated utility
    const aiResult = await analyzeDocumentWithGemini(body.documentUrl);
    
    return NextResponse.json({ success: true, data: aiResult });
  } catch (error) {
    console.error("[api/verify/document-upload]", error);
    // Never expose raw backend errors to the client
    return NextResponse.json(
      { success: false, error: "Document verification pipeline failed." },
      { status: 500 }
    );
  }
}


Error Boundaries — Every route handler must contain a try/catch.

Validation — Always validate the incoming req.json() structure.

Logging Prefix — Console errors must prefix the exact file path (e.g., [api/webhooks/opay]).

Standardized Response — Always return { success: boolean, data?: T, error?: string }.

## Server Actions (Mutations)

// app/actions/escrowActions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function lockInspectionEscrow(listingId: string, amount: number) {
  try {
    const supabase = await createClient();
    // 1. Validate inputs and authentication
    // 2. Execute DB write (e.g., insert into transactions table)
    
    revalidatePath(`/listing/${listingId}`);
    return { success: true };
  } catch (error) {
    console.error("[actions/escrowActions]", error);
    return { success: false, error: "Failed to lock inspection escrow." };
  }
}


Path Revalidation — Always call revalidatePath when a mutation modifies UI-dependent data.

Error Returns — Never throw an unhandled error from a Server Action; catch it and return the { success: false, error: string } payload to be handled gracefully by the UI toast system.

## Supabase Client Usage Pattern

There is a strict firewall between the browser client and the server client. Never mix them.

Browser Context (Client Components Only):

Path: import { createClient } from "@/lib/supabase/client";

Usage: Read-only operations for public feeds, or subscribing to Realtime WebSocket chat threads.

Server Context (Server Components, Actions, API Routes):

Path: import { createClient } from "@/lib/supabase/server";

Usage: Secure data fetching, inserts, and updates.

Admin Override: If a webhook (like OPay settlement) needs to update a record outside of a user's RLS policy, the server client must be instantiated explicitly with the SUPABASE_SERVICE_ROLE_KEY.

## Error Handling & Spatial Privacy

No Empty Catches — Never swallow an error silently.

Human-Readable UI Errors — Map technical failures to UX-friendly messages (e.g., "We couldn't verify your location. Please ensure GPS is enabled." instead of "PostGIS ST_Distance null vector").

Spatial Privacy — In error logs, never output exact raw latitude/longitude coordinates of users or properties. Abstract to neighborhood context or log simply as "Coordinate mismatch."

## PostHog Telemetry Events

Rentral relies on factual behavioral data to power the B2B 'Rentral Insights' platform. All PostHog events must use these exact event names.

onboarding_kyc_completed

When: User successfully passes Didit verification.

Properties: userId, idType (NIN/BVN).

listing_hardware_locked

When: A lister successfully completes a walkthrough and PostGIS locks the coordinates.

Properties: userId, category, basePrice, neighborhood.

inspection_escrow_deposited

When: Seeker pays ₦3,000 to lock an inspection slot.

Properties: seekerId, listingId, amount.

spatial_handshake_success

When: OTP is scanned and PostGIS confirms both devices are within 20 meters.

Properties: seekerId, listerId, listingId, distanceMeters.

multi_year_escrow_locked

When: A Seeker commits to a custom duration lease.

Properties: seekerId, listingId, durationYears, totalValue.

holding_lock_expired

When: Supabase Edge Function executes a split payout because a 24-hour hold defaulted.

Properties: listingId, defaultedSeekerId, compensationAmount.

year2_route_updated

When: Tenant verifies a lease renewal Open Banking hash.

Properties: tenantId, listingId, managementType (agent vs. direct).

## Environment Variables

All variables are defined in .env.local. Never hardcode keys, URLs, or secrets in the codebase.

## Frontend-Exposed Variables (Must start with NEXT_PUBLIC_):

NEXT_PUBLIC_SUPABASE_URL — Database routing.

NEXT_PUBLIC_SUPABASE_ANON_KEY — Client-side DB requests.

NEXT_PUBLIC_SUPABASE_ANON_KEY — Authentication UI.

NEXT_PUBLIC_POSTHOG_KEY — Browser telemetry.

NEXT_PUBLIC_POSTHOG_HOST — Telemetry routing.

## Secure Server-Only Variables (No prefixes):

SUPABASE_SERVICE_ROLE_KEY — Admin DB overrides (Webhooks/CRONs).

SUPABASE_SERVICE_ROLE_KEY — Server-side auth validation.

OPAY_SECRET_KEY — Virtual Account and Transfer APIs.

PAYSTACK_SECRET_KEY — Open Banking verification fallback.

SMILE_ID_API_KEY — Identity verification.

GEMINI_API_KEY — Multimodal forgery detection.

## Architectural Constants

System-wide thresholds must be defined in a centralized utility file. Never hardcode these values inline.

// lib/utils.ts

// Spatial Trust Threshold
export const PROXIMITY_RADIUS_METERS = 20;

// Anti-Spam Gate
export const LISTING_CREATION_FEE_NGN = 1000;

// Inspection Escrow
export const INSPECTION_FEE_NGN = 3000;

// Default Leasing
export const DEFAULT_LEASE_YEARS = 1;

// Holding Lock Configuration
export const HOLDING_LOCK_HOURS = 24;
export const PLATFORM_SPLIT_PERCENTAGE = 0.30; // 30% to Rentral on default


## Approved Dependencies

Do not install new packages without architectural review. Rely on native Next.js solutions or the Shadcn UI library first.

Authentication & Identity: @supabase/ssr, @smile_identity/web-sdk

Database & State: @supabase/ssr, @supabase/supabase-js, zustand, @tanstack/react-query

Media & Processing: @mux/mux-player-react

Artificial Intelligence: @google/generative-ai

Analytics: posthog-js, posthog-node

UI & Styling: tailwindcss (v4), lucide-react (Icons), clsx, tailwind-merge (via Shadcn)

Date & Validation: date-fns, zod

(Note: Do not install any mapping libraries like Leaflet or Mapbox unless strictly rendering read-only analytical heatmaps for the B2B portal. Consumer-facing spatial checks are handled mathematically via PostGIS behind the scenes).