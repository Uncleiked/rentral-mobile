<!-- # Architecture

## Stack

| Layer                          | Tool                     | Purpose                                          |
| ------------------------------ | ------------------------ | ------------------------------------------------ |
| Framework                      | Next.js 16 (App Router)  | Full stack framework                             |
| Auth + DB + Storage + Realtime | InsForge                 | Entire backend                                   |
| Cloud browser                  | Browserbase              | Company research — browsing company public pages |
| AI browser control             | Stagehand                | Company page interaction and content extraction  |
| Job Discovery                  | Adzuna API               | Job search and discovery                         |
| AI model                       | OpenAI GPT-4o            | Matching, research synthesis, extraction         |
| Analytics                      | PostHog                  | Event tracking and dashboard charts              |
| PDF generation                 | @react-pdf/renderer      | Resume PDF rendering                             |
| Styling                        | Tailwind CSS + shadcn/ui | UI components and styling                        |
| Language                       | TypeScript strict        | Throughout                                       |

---

## Folder Structure

```
/
├── AGENTS.md
├── context/
│   ├── project-overview.md
│   ├── architecture.md
│   ├── ui-tokens.md
│   ├── ui-rules.md
│   ├── ui-registry.md
│   ├── code-standards.md
│   ├── library-docs.md
│   ├── build-plan.md
│   └── progress-tracker.md
├── app/
│   ├── layout.tsx                          → Root layout, PostHog provider
│   ├── page.tsx                            → Homepage
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx                   → Login page
│   │   └── callback/
│   │       └── page.tsx                   → OAuth callback handler
│   ├── dashboard/
│   │   └── page.tsx                       → Main dashboard
│   ├── profile/
│   │   └── page.tsx                       → Profile form + resume management
│   ├── find-jobs/
│   │   ├── page.tsx                       → Find Jobs page — search controls + jobs list
│   │   └── [id]/
│   │       └── page.tsx                   → Individual job details page
│   └── api/
│       ├── agent/
│       │   ├── find/route.ts              → Trigger Adzuna job discovery
│       │   └── research/route.ts          → Trigger company research agent
│       ├── resume/
│       │   ├── generate/route.ts          → Generate base resume PDF from profile
│       │   └── extract/route.ts           → Extract profile data from uploaded resume PDF
├── agent/
│   ├── adzuna.ts                          → Adzuna API job discovery + GPT-4o scoring
│   ├── research.ts                        → Company research — Browserbase + Stagehand + GPT-4o
│   ├── matcher.ts                         → GPT-4o job matching logic
│   ├── extractor.ts                       → GPT-4o job description extraction + structuring
│   └── types.ts                           → Agent-specific TypeScript types
├── actions/
│   ├── profile.ts                         → Profile save + update
│   └── jobs.ts                            → Job status updates
├── components/
│   ├── ui/                                → shadcn/ui components only
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   └── Footer.tsx
│   ├── homepage/
│   │   ├── Hero.tsx
│   │   ├── HowItWorks.tsx
│   │   └── Features.tsx
│   ├── dashboard/
│   │   ├── StatsBar.tsx
│   │   ├── RecentActivity.tsx
│   │   └── AnalyticsCharts.tsx
│   ├── profile/
│   │   ├── ProfileForm.tsx
│   │   ├── ResumeUpload.tsx
│   │   ├── ResumePreview.tsx
│   │   └── CompletionIndicator.tsx
│   ├── find-jobs/
│   │   ├── SearchControls.tsx
│   │   ├── JobsTable.tsx
│   │   ├── JobFilters.tsx
│   │   └── JobsPagination.tsx
│   └── job-details/
│       ├── JobInfo.tsx
│       ├── MatchScore.tsx
│       ├── JobDescription.tsx
│       ├── CompanyResearch.tsx
│       └── JobActions.tsx
├── lib/
│   ├── insforge-client.ts                 → InsForge browser client instance
│   ├── insforge-server.ts                 → InsForge server client
│   ├── browserbase.ts                     → Browserbase session creation + management
│   ├── stagehand.ts                       → Stagehand initialisation with Browserbase session
│   ├── adzuna.ts                          → Adzuna API client
│   ├── posthog-client.ts                  → PostHog browser client
│   ├── posthog-server.ts                  → PostHog server client
│   └── utils.ts                           → Shared utility functions
└── types/
    └── index.ts                           → Global TypeScript types
```

---

## System Boundaries

| Folder        | Owns                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| `app/`        | Pages and API routes only. No business logic.                                                          |
| `agent/`      | All agent logic. Adzuna discovery, company research, matching, extraction. Nothing here touches React. |
| `actions/`    | Server Actions for UI-triggered mutations only. Profile save, profile update.                          |
| `components/` | UI only. No data fetching logic. No direct DB calls.                                                   |
| `lib/`        | Third party client initialisation and shared utilities only.                                           |
| `types/`      | TypeScript types shared across the project.                                                            |

---

## Data Flow

### UI Mutations (Server Actions)

```
User interaction in component
        ↓
Server Action in actions/
        ↓
InsForge DB write
        ↓
Revalidate or redirect
```

### Agent Operations (API Routes)

```
User clicks Find Jobs
        ↓
API route in app/api/agent/find
        ↓
Calls agent/adzuna.ts
        ↓
Adzuna API returns job listings
        ↓
GPT-4o scores each job against user profile
        ↓
Agent writes results to InsForge DB
        ↓
Page data revalidated
```

### Company Research (API Routes)

```
User clicks Research Company on job details page
        ↓
API route in app/api/agent/research
        ↓
Calls agent/research.ts
        ↓
Single Browserbase session opens with Stagehand
        ↓
Navigates to company homepage + sub pages
        ↓
GPT-4o synthesizes dossier from extracted content
        ↓
Dossier saved to jobs.company_research
        ↓
Page data revalidated
```

### Resume Operations (API Routes)

```
User uploads resume or clicks Generate
        ↓
API route in app/api/resume/
        ↓
GPT-4o processes content
        ↓
@react-pdf/renderer renders PDF buffer
        ↓
New PDF uploaded to InsForge Storage
        ↓
URL saved to profiles table
```

---

## InsForge Database Schema

### `profiles`

| Column              | Type        | Notes                                        |
| ------------------- | ----------- | -------------------------------------------- |
| id                  | uuid        | References auth.users                        |
| full_name           | text        |                                              |
| email               | text        | Pre-filled from auth                         |
| phone               | text        |                                              |
| location            | text        | City, country                                |
| current_title       | text        | Most recent job title                        |
| experience_level    | text        | junior / mid / senior / lead                 |
| years_experience    | integer     |                                              |
| skills              | text[]      | Array of skill tags                          |
| industries          | text[]      | Industries worked in                         |
| work_experience     | jsonb       | Array of up to 3 roles                       |
| education           | jsonb       | Degree, field, institution, year             |
| job_titles_seeking  | text[]      | Roles they want                              |
| remote_preference   | text        | remote / onsite / hybrid / any               |
| preferred_locations | text[]      | Optional preferred locations                 |
| salary_expectation  | text        | Optional                                     |
| cover_letter_tone   | text        | formal / casual / enthusiastic               |
| linkedin_url        | text        |                                              |
| portfolio_url       | text        |                                              |
| work_authorization  | text        | citizen / permanent_resident / visa_required |
| resume_pdf_url      | text        | InsForge Storage URL of current resume       |
| is_complete         | boolean     | True when all required fields filled         |
| created_at          | timestamptz |                                              |
| updated_at          | timestamptz |                                              |

### `agent_runs`

| Column             | Type        | Notes                        |
| ------------------ | ----------- | ---------------------------- |
| id                 | uuid        |                              |
| user_id            | uuid        | References profiles          |
| status             | text        | running / completed / failed |
| job_title_searched | text        |                              |
| location_searched  | text        |                              |
| jobs_found         | integer     | Total jobs discovered        |
| started_at         | timestamptz |                              |
| completed_at       | timestamptz |                              |

### `jobs`

| Column             | Type        | Notes                                          |
| ------------------ | ----------- | ---------------------------------------------- |
| id                 | uuid        |                                                |
| run_id             | uuid        | References agent_runs — null if from URL input |
| user_id            | uuid        | References profiles                            |
| source             | text        | search / url                                   |
| source_url         | text        | Original job listing URL                       |
| external_apply_url | text        | Direct company apply URL                       |
| title              | text        |                                                |
| company            | text        |                                                |
| location           | text        |                                                |
| salary             | text        | If available                                   |
| job_type           | text        | fulltime / parttime / contract                 |
| about_role         | text        | 2-3 sentence summary                           |
| responsibilities   | text[]      | Bullet points                                  |
| requirements       | text[]      | Bullet points                                  |
| nice_to_have       | text[]      | Optional                                       |
| benefits           | text[]      | Optional                                       |
| about_company      | text        | Brief company description                      |
| match_score        | integer     | 0-100 scored against main profile              |
| match_reason       | text        | GPT-4o explanation                             |
| matched_skills     | text[]      | Skills user has that match                     |
| missing_skills     | text[]      | Skills user lacks                              |
| company_research   | jsonb       | Company dossier from research agent            |
| found_at           | timestamptz |                                                |

### `agent_logs`

| Column     | Type        | Notes                            |
| ---------- | ----------- | -------------------------------- |
| id         | uuid        |                                  |
| run_id     | uuid        | References agent_runs            |
| user_id    | uuid        | References profiles              |
| message    | text        | Human readable log entry         |
| level      | text        | info / success / warning / error |
| job_id     | uuid        | Optional — related job           |
| created_at | timestamptz |                                  |

---

## InsForge Storage

| Bucket  | Path                         | Contents                  |
| ------- | ---------------------------- | ------------------------- |
| resumes | resumes/{user_id}/resume.pdf | Current active resume PDF |

Access: authenticated users only, own files only.

---

## Authentication

- Provider: InsForge Auth
- Methods: Google OAuth, GitHub OAuth
- Protected routes: /dashboard, /profile, /find-jobs, /find-jobs/[id]
- Public routes: /, /login
- Middleware in middleware.ts checks session on every protected route
- On login → redirect to /dashboard

---

## InsForge Client Pattern

Two separate InsForge instances — never mix them:

```typescript
// lib/insforge-client.ts
// Browser-side — used in client components for auth state
import { createBrowserClient } from "@insforge/ssr";
export const insforge = createBrowserClient(
  process.env.NEXT_PUBLIC_INSFORGE_URL!,
  process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY!,
);

// lib/insforge-server.ts
// Server-side — used in API routes, Server Actions, agent code
import { createServerClient } from "@insforge/ssr";
import { cookies } from "next/headers";

export const createInsforgeServer = async () => {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_INSFORGE_URL!,
    process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );
};
```

---

## Browserbase Session Pattern

```typescript
// Company research session — single session, sequential page visits
const session = await bb.sessions.create({
  projectId: process.env.BROWSERBASE_PROJECT_ID!,
  timeout: 120, // 2 minute session — visits 3-4 pages max
});
```

---

## Job Discovery Pattern

**Adzuna API — job search**

```typescript
const response = await fetch(
  `https://api.adzuna.com/v1/api/jobs/us/search/1?` +
    `app_id=${process.env.ADZUNA_APP_ID}&` +
    `app_key=${process.env.ADZUNA_APP_KEY}&` +
    `what=${encodeURIComponent(jobTitle)}&` +
    `where=${encodeURIComponent(location)}&` +
    `category=it-jobs&` +
    `results_per_page=10&` +
    `content-type=application/json`,
);
const data = await response.json();
// data.results — array of job listings
// Each job: title, company.display_name, location.display_name,
//           salary_min, salary_max, description, redirect_url, created
```

---

## Company Research Pattern

```typescript
// Single session — visits company homepage and sub pages sequentially
const stagehand = new Stagehand({
  env: "BROWSERBASE",
  apiKey: process.env.BROWSERBASE_API_KEY!,
  projectId: process.env.BROWSERBASE_PROJECT_ID!,
  browserbaseSessionID: session.id,
  modelName: "gpt-4o",
  modelClientOptions: { apiKey: process.env.OPENAI_API_KEY! },
});

await stagehand.init();
const page = stagehand.page;

// Clean company name and construct homepage URL
const cleanName = companyName
  .replace(/\s*(Inc\.?|LLC|Ltd\.?|Corp\.?|Co\.?).*$/i, "")
  .trim()
  .toLowerCase()
  .replace(/\s+/g, "");

const homepageUrl = `https://www.${cleanName}.com`;

// Navigate and extract — graceful fallback if page not found
try {
  await page.goto(homepageUrl);
  await page.waitForLoadState("networkidle");
  const content = await stagehand.extract({ instruction: "..." });
} catch (error) {
  // Log and continue — GPT-4o will synthesize from what was found
  await logAgentError(jobId, error);
}

// Always close session when done
await stagehand.close();
```

---

## Invariants

Rules the AI agent must never violate:

- API routes contain no UI logic. Components contain no DB logic.
- Agent code in `/agent` never imports from `/components` or `/actions`.
- Server Actions never call agent functions. Agent functions are only called from API routes.
- All InsForge server-side writes use `createInsforgeServer()` — never the browser client.
- No hardcoded hex values or raw Tailwind color classes in components — use CSS variables from ui-tokens.md.
- Every Stagehand action is wrapped in try/catch. Failures are logged to agent_logs, never thrown to crash the run.
- Company research always returns a dossier — even if browser research fails, GPT-4o synthesizes from company name and job description alone. Never return empty.
- Browserbase sessions are always closed with stagehand.close() when done — never leave sessions open.
- Always scope InsForge queries to the current user_id — never query without a user filter.
- Adzuna API always includes category=it-jobs — never search without this filter.
- jobs.source is always 'search' or 'url' — never any other value. -->


# Architecture
## Stack


Layer	Tool	Purpose
Framework	Next.js 16 (App Router)	Full-stack architecture for Rentral (React 19, Turbopack compilation engine)
Authentication	Clerk Auth (v5)	Session propagation across devices (Mobile capture to Desktop continuation)
Database Engine	Supabase PostgreSQL	Transactional storage layer with native support for PostGIS geography extensions
Geospatial Engine	PostGIS Extension	Spatial coordinate indexing, 100m variance verification, and radius-bounded lookups
State Management	Zustand	Multi-device step-wizard tracking, filter configurations, and transient data syncing
UI Component Kit	shadcn/ui	Accessible interface primitives built using Radix UI and Tailwind CSS v4.0
Video Delivery Network	Mux Video API	Direct-from-camera mobile HLS stream ingestion, processing, and delivery
Local Settlement	Paystack API	Escrow collection, automated booking locks, and intra-African banking payouts
Global Settlement	Stripe API	Processing international diaspora capital, cross-border memberships, and currencies
Identity Compliance	Smile ID API	Instant individual NIN/BVN checks and automated corporate CAC lookups
Observability	PostHog	Funnel monitoring, telemetry tracking, and spatial validation drops
Styling Framework	Tailwind CSS v4.0	Utility-first component styling using the modern CSS-native configuration engine
Language	TypeScript Strict	Structural compilation safety across API routes, stores, and components

## Folder Structure/

├── CONTEXT.md
├── context/
│   ├── project-overview.md     → Strategic goals and value proposition for Rentral
│   ├── architecture.md         → This comprehensive system architecture specification
│   ├── ui-tokens.md            → Tailwind theme variables, colors, and layout tokens
│   ├── ui-rules.md             → Layout composition and interaction rules
│   ├── code-standards.md       → Component abstraction rules and strict TypeScript guides
│   ├── build-plan.md           → Phased execution sequencing roadmap
│   └── progress-tracker.md     → Development milestone tracking ledger
├── app/
│   ├── layout.tsx              → Root layout injecting PostHog, Clerk, and shadcn themes
│   ├── page.tsx                → Public marketing landing page and high-level discovery core
│   ├── (auth)/                 
│   │   ├── sign-in/page.tsx    → Clerk authentication customized interface shell
│   │   └── sign-up/page.tsx    → Multi-tenant onboarding registration pipeline
│   ├── dashboard/              
│   │   ├── layout.tsx          → Role-based router layout intercepting profile types via JWT claims
│   │   ├── regular-user/       → Saved listings, active applications, and flat-sharing matching views
│   │   ├── landlord/           → Property assets portfolio, booking grids, and settlement logs
│   │   ├── agent/              → Commission ledgers, client listings, and active verification trays
│   │   └── organization/       → Corporate fleet access management, staff assignments, and analytics
│   ├── listings/               
│   │   ├── page.tsx            → Advanced Parametric Search (Multi-intent Rent / Buy / Squat engine)
│   │   ├── [id]/page.tsx       → Dynamic asset layout rendering interactive HLS Mux video streams
│   │   └── create/              
│   │       ├── page.tsx        → Cross-device creation gateway (Detects mobile vs desktop layouts)
│   │       ├── mobile-capture/ → Mobile in-app video recorder with hardware geolocation tagging
│   │       └── desktop-resume/ → Desktop document wizard and parametric text specification layout
│   ├── squat-mates/            
│   │   ├── page.tsx            → Dedicated co-living directory for tenants seeking squat companions
│   │   └── preferences/page.tsx→ Structural configuration layout for budget, habits, and locations
│   └── api/                    
│       ├── listings/           
│       │   ├── search/route.ts → Executes highly indexed multi-attribute parametric search queries
│       │   ├── drafts/route.ts → Handles geolocation-isolated draft pooling and timestamp tracking
│       │   ├── create/route.ts → Validates manual user forms and finalizes spatial checks to publish
│       │   └── verify/route.ts → Stores uploaded ownership titles (C of O, Deeds of Assignment)
│       ├── video/              
│       │   ├── upload/route.ts → Generates signed, authenticated direct-ingest targets for Mux
│       │   └── webhook/route.ts→ Monitors real-time video transcoding and asset readiness states
│       └── compliance/route.ts → Catches asynchronous KYC / KYB updates from SmileID endpoints
├── core/                       
│   ├── search-engine.ts        → PostGIS-backed combined attribute and geographical filtering compiler
│   ├── spatial-validator.ts    → Validates hardware capture coordinates against geocoded input points
│   ├── video-processor.ts      → Verifies unique file hashes and runs duration enforcement algorithms
│   ├── ledger-manager.ts       → Controls cross-border automated split payouts and escrow locking
│   └── types.ts                → Strict framework-independent contract definitions
├── actions/                    
│   ├── drafts.ts               → Server action processing intermediate field persistence mutations
│   ├── profile.ts              → Saves role configurations, lifestyle data, and verification values
│   └── bookings.ts             → Manages reservation lock-ins and processes on-site QR checking validations
├── store/                      
│   ├── useSearchStore.ts       → Zustand global store managing advanced filter values and map canvas boundaries
│   └── useWizardStore.ts       → Zustand local state engine synchronizing user inputs through shadcn forms
├── components/                 
│   ├── ui/                     → shadcn/ui components (Dialog, Select, Input, Slider, Button, Dropdown)
│   ├── layout/                 
│   │   ├── Navbar.tsx          → Adaptive navigation header syncing context to active user type
│   │   └── Footer.tsx          
│   ├── search/                 
│   │   ├── ParametricFilters.tsx→ Advanced filter side-bar handling specific structural asset filters
│   │   └── MapCanvas.tsx       → Vector map layer visualizing coordinate outputs from PostGIS queries
│   ├── listings/               
│   │   ├── MobileRecorder.tsx  → HTML5 MediaRecorder interface mapping live hardware geolocation
│   │   ├── ParametricInputs.tsx→ Input selection controls for numeric counts (beds, baths, kitchens)
│   │   ├── DocumentDropzone.tsx→ Secure file drop interface processing C of O and Deed PDF arrays
│   │   └── VerificationBadge.tsx→ Visual representation displaying listing security and backing states
│   └── checkout/               
│       ├── PaystackWidget.tsx  → Inline local currency transaction collection component
│       └── StripeButton.tsx    → Outbound cross-border settlement gateway trigger
├── lib/                        
│   ├── supabase-client.ts      → Browser-side serverless database connection instance
│   ├── supabase-server.ts      → Server-side database wrapper with automated cookie preservation hooks
│   ├── posthog-client.ts       → Frontend operational interaction telemetry interface
│   └── utils.ts                → Custom layout utility scripts (e.g., shadcn/ui cn class mergers)
└── types/                      
    └── index.ts                → Standard unified types shared directly with the future Expo target app
    

# Detailed Data Flows & Cross-Device Synchronization1. 
## Mobile Geolocation Capture & Draft Isolation Flow

Agent opens Rentral on Mobile at Property site → Clicks "Record Walkthrough"
                                        ↓
  Browser requests active hardware geolocation coordinates via navigator.geolocation API
                                        ↓
     Web interface requests direct-upload tokens from app/api/video/upload
                                        ↓
Agent streams video via camera bucket → Bytes write straight to Mux secure servers
                                        ↓
     POST request targets app/api/listings/drafts sending captured Lat/Lng metrics
                                        ↓
                     System evaluates spatial index map:
  → IF coordinates sit outside an existing draft circle (radius > 50m): Create a NEW unique Draft ID
  → IF coordinates sit within an existing draft circle (radius ≤ 50m): Link to that Draft Group,
    differentiating the item via an exact creation timestamp payload

# 2. Desktop Continuation & Parametric Data Entry Flow

Agent logs into Desktop interface → Navigates to "My Drafts Tray"
                                        ↓
  Zustand store pulls outstanding draft data grouped by location strings and timestamp logs
                                        ↓
Agent selects target draft → Video preview loads via Mux alongside input screens
                                        ↓
Agent interacts with shadcn/ui selection widgets to specify numeric asset parameters
  (Clicks [Bedrooms] → Inputs '3' | Clicks [Bathrooms] → Inputs '2' | Selects State → 'Lagos')
                                        ↓
Agent uploads property titles (C of O / Deed of Assignment) into DocumentDropzone
                                        ↓
Agent enters textual street address and clicks "Publish Listing" → Dispatches payload

# 3. Automated Spatial Validation Check Sequence

            Final Listing Payload arrives at app/api/listings/create
                                        ↓
System pushes textual Address + State fields to internal Geocoding service to resolve coordinates
                                        ↓
   App executes core/spatial-validator.ts against the chosen listing record
                                        ↓
  PostGIS calculates exact distance between resolved text coordinates and the immutable
  hardware latitude/longitude points stamped on the media file by the phone camera
                                        ↓
                 Validation threshold test evaluation:
  → IF distance calculated is less than or equal to 100 meters: Status updates to 'pending_document_review'
  → IF distance calculated is greater than 100 meters: Request dropped, transaction blocked, log to PostHog

# Supabase Database Schema
## profiles

Column,Type,Notes
id,uuid,PRIMARY KEY. References Clerk authentication user record.
email,text,Unique contact address.
user_role,varchar(30),"Constraints: regular_user, landlord, agent, organization."
verification_tier,varchar(20),"Security status: unverified, individual_kyc, corporate_kyb."
squat_preferences,jsonb,"Stores lifestyle alignment rules (budgets, habits, location arrays)."
compliance_payload,jsonb,Encrypted container for verified individual NIN/BVN and corporate CAC data.
created_at,timestamptz,Immutable registration creation timestamp marker.

# listings

Column,Type,Notes
id,uuid,PRIMARY KEY. Shared interface asset token identifier.
provider_id,uuid,Foreign Key referencing property manager in profiles. Protected via RLS.
asset_type,varchar(20),"High-level index splitter: real_estate, car, yacht."
intent_type,varchar(20),"Search category switch: rent, buy, squat."
status,varchar(30),"State machine: draft, pending_document_review, live, flagged, archived."
title,text,Descriptive search header text.
description,text,Main marketing copy block.
state_province,varchar(50),"State key used for fast regional parametric lookups (e.g., 'Lagos')."
address_text,text,Manual text description input indicating property location.
text_geo_location,"geography(Point, 4326)",PostGIS point mapped from manual textual geocoding translation.
hardware_capture_location,"geography(Point, 4326)",Immutable PostGIS coordinates stamped by mobile phone GPS during camera recording.
bedrooms_count,integer,Highly indexed parametric column for advanced query filtering.
bathrooms_count,integer,Highly indexed parametric column for advanced query filtering.
kitchens_count,integer,Standard parametric attribute column tracking asset facilities.
custom_specifications,jsonb,"Schemaless attribute matrix tracking special sub-assets (e.g., car mileage)."
price_per_period,numeric,Operational financial charge value tracking base cost.
verification_status,varchar(30),"Title safety verification state: unverified, pending_review, verified, rejected."
document_payload,jsonb,Array containing secure Supabase storage URLs pointing to C of O or Title Deeds.
is_sponsored,boolean,Triggers priority promotion inside user discovery search result arrays.
created_at,timestamptz,Initial mobile draft generation creation date.
updated_at,timestamptz,Last change validation timestamp log.

# Zustand Store Architectures
## 1. Market Advanced Filter State Engine 

```TypeScript
// store/useSearchStore.ts
import { create } from "zustand";

interface SearchFilters {
  assetType: 'real_estate' | 'car' | 'yacht';
  intentType: 'rent' | 'buy' | 'squat';
  stateProvince: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  priceRange: [number, number];
  mapBounds: number[][] | null;
}

interface SearchActions {
  setIntent: (intent: 'rent' | 'buy' | 'squat') => void;
  setParametricFilter: (key: 'bedrooms' | 'bathrooms', value: number | null) => void;
  updateFilters: (filters: Partial<SearchFilters>) => void;
  resetFilters: () => void;
}

export const useSearchStore = create<SearchFilters & SearchActions>((set) => ({
  assetType: 'real_estate',
  intentType: 'rent',
  stateProvince: null,
  bedrooms: null,
  bathrooms: null,
  priceRange: [0, 100000000],
  mapBounds: null,

  setIntent: (intentType) => set({ intentType }),
  setParametricFilter: (key, value) => set({ [key]: value }),
  updateFilters: (filters) => set((state) => ({ ...state, ...filters })),
  resetFilters: () => set({ assetType: 'real_estate', intentType: 'rent', stateProvince: null, bedrooms: null, bathrooms: null, priceRange: [0, 100000000], mapBounds: null })
}));

#  2. Multi-Device Step Listing Wizard StoreTypeScript
# // store/useWizardStore.ts


 import { create } from "zustand";

interface WizardDraftState {
  draftId: string | null;
  hardwareLat: number | null;
  hardwareLng: number | null;
  muxPlaybackId: string | null;
  // Parametric form properties fields
  stateProvince: string;
  addressText: string;
  bedrooms: number;
  bathrooms: number;
  kitchens: number;
  uploadedDocPaths: string[];
}

interface WizardActions {
  initializeMobileDraft: (id: string, lat: number, lng: number, videoToken: string) => void;
  setParametricData: (fields: Partial<Omit<WizardDraftState, 'initializeMobileDraft'>>) => void;
  clearWizard: () => void;
}

export const useWizardStore = create<WizardDraftState & WizardActions>((set) => ({
  draftId: null,
  hardwareLat: null,
  hardwareLng: null,
  muxPlaybackId: null,
  stateProvince: "",
  addressText: "",
  bedrooms: 0,
  bathrooms: 0,
  kitchens: 0,
  uploadedDocPaths: [],

  initializeMobileDraft: (id, lat, lng, videoToken) => set({
    draftId: id,
    hardwareLat: lat,
    hardwareLng: lng,
    muxPlaybackId: videoToken
  }),
  setParametricData: (fields) => set((state) => ({ ...state, ...fields })),
  clearWizard: () => set({ draftId: null, hardwareLat: null, hardwareLng: null, muxPlaybackId: null, stateProvince: "", addressText: "", bedrooms: 0, bathrooms: 0, kitchens: 0, uploadedDocPaths: [] })
}));


# Technical ImplementationsPostGIS Multi-Intent Parametric Filtering Query CompilerTypeScript
# // core/search-engine.ts

import { createServerInstance } from "@/lib/supabase-server";

interface AdvancedSearchCriteria {
  assetType: 'real_estate' | 'car' | 'yacht';
  intentType: 'rent' | 'buy' | 'squat';
  stateProvince?: string;
  bedrooms?: number;
  bathrooms?: number;
  minPrice?: number;
  maxPrice?: number;
}

export async function executeParametricSearch(criteria: AdvancedSearchCriteria) {
  const supabase = await createServerInstance();

  // Primary structural selection query optimization
  let query = supabase
    .from('listings')
    .select(`
      id, 
      title, 
      price_per_period, 
      intent_type, 
      state_province, 
      bedrooms_count, 
      bathrooms_count, 
      verification_status,
      document_payload
    `)
    .eq('asset_type', criteria.assetType)
    .eq('intent_type', criteria.intentType)
    .eq('status', 'live'); // Only expose verified, operational published listings

  // Chain highly indexed column filters if passed by search store
  if (criteria.stateProvince) {
    query = query.eq('state_province', criteria.stateProvince);
  }
  if (criteria.bedrooms !== undefined && criteria.bedrooms !== null) {
    query = query.eq('bedrooms_count', criteria.bedrooms);
  }
  if (criteria.bathrooms !== undefined && criteria.bathrooms !== null) {
    query = query.eq('bathrooms_count', criteria.bathrooms);
  }
  if (criteria.minPrice) {
    query = query.gte('price_per_period', criteria.minPrice);
  }
  if (criteria.maxPrice) {
    query = query.lte('price_per_period', criteria.maxPrice);
  }

  const { data, error } = await query.order('is_sponsored', { ascending: false });
  
  if (error) {
    throw new Error(`Advanced query execution failed: ${error.message}`);
  }

  return data;
}


# Hardware Video vs Geocoded Input Validation CheckTypeScript
# // core/spatial-validator.ts

import { createServerInstance } from "@/lib/supabase-server";

interface SpatialValidationInput {
  listingId: string;
  resolvedLat: number; // Extracted via address field geocoding parsing translation
  resolvedLng: number;
}

export async function verifyListingSpatialIntegrity({ listingId, resolvedLat, resolvedLng }: SpatialValidationInput): Promise<boolean> {
  const supabase = await createServerInstance();

  // Call PostgreSQL RPC function to calculate physical distance using PostGIS geography models
  const { data: spatialMatch, error } = await supabase.rpc('verify_hardware_to_address_proximity', {
    target_listing_id: listingId,
    input_lat: resolvedLat,
    input_lng: resolvedLng,
    allowed_variance_meters: 100 // System strict threshold boundary rule
  });

  if (error) {
    throw new Error(`Spatial verification failure: ${error.message}`);
  }

  return !!spatialMatch;
}

SQL
-- Associated Database RPC function created inside Supabase instance engine

CREATE OR REPLACE FUNCTION verify_hardware_to_address_proximity(
  target_listing_id UUID,
  input_lat NUMERIC,
  input_lng NUMERIC,
  allowed_variance_meters INT
) RETURNS BOOLEAN AS $$
DECLARE
  hardware_geo GEOGRAPHY;
  input_geo GEOGRAPHY;
  calculated_distance_meters FLOAT;
BEGIN
  -- Grab immutable hardware coordinate stamped during raw mobile video capture
  SELECT hardware_capture_location INTO hardware_geo
  FROM listings
  WHERE id = target_listing_id;

  IF hardware_geo IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Build geography instance point wrapper from geocoded address numeric params
  input_geo := ST_SetSRID(ST_MakePoint(input_lng, input_lat), 4326)::geography;

  -- Calculate exact distance expression metric using native PostGIS mechanics
  calculated_distance_meters := ST_Distance(hardware_geo, input_geo);

  -- Return validation assertion comparison response flag
  RETURN calculated_distance_meters <= allowed_variance_meters;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

# Invariants
# Rules the Rentral system architecture and automated processes must never break:

Isolated View Architecture: Components must remain view-only. No UI layout files are allowed to build or execute database update expressions or process payment actions.
Biometric Security Gates: Providers cannot toggle listings to a live state if their compliance level (verification_tier) reads as unverified. Individual verification requires an automated SmileID biometric confirmation match.
Geospatial Variance Boundaries: Real estate, vehicle, and marine listings will be blocked from live presentation across directories if the geographical variance check between the recorded coordinates and address text exceeds 100 meters.
Unique File Integrity Constraints: Every media payload processed by background ingestion tasks must compute an exact cryptographic hash. Duplicate uploads of existing recordings are rejected immediately.
Strict Legal Verification: Any asset explicitly flagged under the buy or rent transaction category parameters must upload valid proof of registry files (C of O, verified titles) before being approved into public directories.
State Partitioning Boundaries: Do not use Zustand to write or cache data metrics that require database persistent lifecycle synchronization. Use Zustand exclusively to orchestrate local interaction structures and step values.
Zero Metadata Exposure: PostHog telemetry hooks must filter or drop private client parameters (e.g., identity cards, BVN keys, billing tokens) before compiling telemetry summaries.
Immutable Context Boundaries: All active database adjustments tracking internal listings or reservation profiles must include explicit tenant or host conditions matched against verified identity profiles.
Dynamic Video Cut-Off: Upload pipelines must discard media uploads whose playtime values exceed 120 seconds.