# UI Registry

Living document. Updated after every component is built. Read this before building any new component — match existing patterns exactly before inventing new ones.

---

## How to Use

Before building any component:

1. Check if a similar component already exists here
2. If yes — match its exact classes
3. If no — build it following ui-rules.md and ui-tokens.md, then add it here

After building any component — update this file with the component name, file path, and exact classes used.

---

## Components

### Navigation & Header

- **File Path**: [app/page.tsx](file:///c:/Users/DAVID%20IKEDIASHI/Documents/rentral/app/page.tsx)
- **Menu Container**: `hidden lg:flex items-center gap-1 rounded-full border border-glass-border-medium bg-glass-dark p-1.5 text-[11px] font-bold uppercase tracking-wider text-text-secondary backdrop-blur-lg`
- **Auth Pill Container**: `relative z-20 flex items-center gap-2 rounded-full border border-glass-border-medium bg-glass-dark p-1 text-[11px] font-bold uppercase tracking-wider backdrop-blur-lg`
- **Logo Image**: `h-8 w-8 object-contain brightness-0 invert` (renders black paths as white)

### Hero Layout

- **File Path**: [app/page.tsx](file:///c:/Users/DAVID%20IKEDIASHI/Documents/rentral/app/page.tsx)
- **Hero Wrapper**: `hero-section relative isolate overflow-hidden bg-brand-vault px-6 pb-20 pt-6 sm:px-10 lg:px-16 lg:pb-24`
- **Hero Scrim Overlay**: `hero-hover-scrim` (linear gradient from forest green to dark background, fades in on hover via `data-image-hovered` attribute)
- **Image Capsule (circle)**: `hero-media-shell` (perfect circle: `border-radius: 50%`, 540×540, absolute desktop, expands to `inset-0 border-radius: 0` on hover to fill entire hero section as background)
- **Circle Expand Overlay**: `hero-expand-overlay` (inner div inside `.hero-media-shell`, dark gradient overlay that fades in during expansion so text remains readable over the full-bleed image)
- **Rotating Text Badge**: `animate-spin-slow` (20 seconds spin rotation applied to SVG textPath, with central star `animate-pulse`)

### About Us & Video Player

- **File Path**: [app/page.tsx](file:///c:/Users/DAVID%20IKEDIASHI/Documents/rentral/app/page.tsx)
- **Trust Orbit concentric icon**: `.trust-orbit` (dual circles with warm accent core)
- **Arched Video Capsule**: `rounded-[180px_180px_48px_48px] overflow-hidden border border-border-subtle bg-surface-card shadow-2xl`
- **Play Button Overlay**: `h-20 w-20 flex items-center justify-center rounded-full bg-text-primary text-text-inverse shadow-2xl transition-transform hover:scale-110`
- **Overlay Text**: `text-4xl font-light uppercase tracking-[0.18em] text-text-primary`

### The Project

- **File Path**: [app/page.tsx](file:///c:/Users/DAVID%20IKEDIASHI/Documents/rentral/app/page.tsx)
- **Horizontal Image Capsule**: `rounded-[180px_180px_48px_48px] overflow-hidden border border-glass-border-light bg-surface-card`
- **Pill Arrows Buttons**: `flex h-12 w-12 items-center justify-center rounded-full border border-glass-border-medium bg-glass-light text-text-primary backdrop-blur-md transition-all hover:bg-glass-light-hover active:scale-95`

### New Sections & Layout Elements

- **File Path**: [app/page.tsx](file:///c:/Users/DAVID%20IKEDIASHI/Documents/rentral/app/page.tsx)
- **Our Quality Grid Card**: `.glass-card` (light translucent background with border, custom gradient glossy sheen slide-in transition on hover)
- **Testimonials Quote Card**: `.glass-card` (features elegant curved quotes, light/glass borders, star ratings, and glossy reflection)
- **CTA Wrapper**: `relative isolate overflow-hidden bg-brand-vault px-6 py-20 text-center sm:px-16` (uses secondary faded backdrop circle for deep ambient layout depth)
- **Centered Brand Footer**: `bg-brand-vault px-6 py-16 sm:px-10 lg:px-16 border-t border-glass-border-light` (centered logo, vertical pipe navigation separators, circular social buttons with hover transitions)

### Global Glossy Glass Interactions

- **File Path**: [app/globals.css](file:///c:/Users/DAVID%20IKEDIASHI/Documents/rentral/app/globals.css)
- **Glossy Button (`.glass-btn`)**: Uses `::before` diagonal gradient mask that shifts `translateX(100%)` to `-100%` on hover for a sliding shine reflection.
- **Glossy Card (`.glass-card`)**: Uses `::before` absolute diagonal gradient overlay anim-shifted from left to right on hover.
- **Glossy Link (`.glass-link`)**: Nav links with a custom underline expansion (`scale-x-0` to `scale-x-100` centering transition) and subtle brightness reflection.

### Marketplace Feed (Reels UI)

- **File Paths**: [app/marketplace/page.tsx](file:///c:/Users/DAVID%20IKEDIASHI/Documents/rentral/app/marketplace/page.tsx), [components/feed/MarketplaceHeader.tsx](file:///c:/Users/DAVID%20IKEDIASHI/Documents/rentral/components/feed/MarketplaceHeader.tsx), [components/feed/MarketplaceFeedCard.tsx](file:///c:/Users/DAVID%20IKEDIASHI/Documents/rentral/components/feed/MarketplaceFeedCard.tsx)
- **Container / Scroll Snap**: `h-full w-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide bg-black max-w-md mx-auto`
- **Sticky Header**: `fixed top-0 left-1/2 -translate-x-1/2 z-50 w-full max-w-md p-4 flex items-center gap-3`
- **Search Bar**: `block w-full pl-10 pr-3 py-3 bg-glass-dark backdrop-blur-md border border-glass-border-medium rounded-xl text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary transition-all`
- **Feed Card (Isolate)**: `h-[100dvh] w-full snap-start snap-always relative isolate bg-background-app`
- **Video Background Scrim**: `absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none`
- **Info Overlay (Bottom Left)**: `absolute bottom-6 left-4 right-20 z-20 flex flex-col gap-3`
- **Action Overlay (Bottom Right)**: `absolute bottom-16 right-4 z-30 flex flex-col items-center gap-5`
- **Action Button (e.g. Like/Message)**: `flex h-12 w-12 items-center justify-center rounded-full border border-glass-border-medium bg-glass-light backdrop-blur-md transition-all active:scale-95`
- **Primary CTA / Book Button**: `mt-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-primary text-text-inverse shadow-2xl active:scale-95 transition-all animate-pulse`
- **Trust Badges**: `rounded-full border border-glass-border-light bg-glass-light px-3 py-1 text-xs font-medium text-text-primary backdrop-blur-sm`

### Listing Capture Wizard

- **File Paths**: [app/marketplace/listing/create/page.tsx](app/marketplace/listing/create/page.tsx), [components/listing/CategorySelector.tsx](components/listing/CategorySelector.tsx), [components/listing/CaptureCanvas.tsx](components/listing/CaptureCanvas.tsx), [components/listing/MetadataForm.tsx](components/listing/MetadataForm.tsx), [components/listing/DocumentUploadZone.tsx](components/listing/DocumentUploadZone.tsx), [components/listing/CheckoutPrompt.tsx](components/listing/CheckoutPrompt.tsx)
- **Route note**: nested under `/marketplace/listing/create` (not top-level `/listing/create`) to match the `/marketplace/profile` convention. Reached via the "Create Listing" CTA on the Listing Hub below, not directly from nav.
- **Page Shell**: `min-h-screen bg-background-app px-4 py-10 sm:px-6`
- **Wizard Stepper**: numbered circle `flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold` — active/passed `bg-accent-primary text-text-inverse`, upcoming `bg-glass-light text-text-muted`; connector line `h-px flex-1` — passed `bg-accent-primary`, upcoming `bg-border-subtle`
- **Selectable List Item (Category Card)**: `flex items-center gap-4 rounded-xl border px-5 py-5 text-left transition-all active:scale-98` — selected `border-accent-primary bg-accent-muted`, unselected `border-border-subtle bg-surface-card`; leading icon in `flex h-12 w-12 items-center justify-center rounded-full border border-glass-border-light bg-glass-light`
- **Full-Screen Capture Canvas**: `relative isolate aspect-[9/16] w-full overflow-hidden rounded-2xl border border-border-subtle bg-background-app shadow-2xl`; top/bottom overlays use the standard Contextual Glassmorphic Panel treatment (`bg-glass-dark backdrop-blur-lg border border-glass-border-light`)
- **Status Pill (GPS lock / REC)**: `flex items-center gap-2 rounded-full border bg-glass-dark px-3 py-1.5 backdrop-blur-lg`, dot `h-2 w-2 rounded-full` colored `bg-trust-verified`/`bg-trust-flagged`
- **Form Input** (matches `components/onboarding/ProfileForm.tsx`): `rounded-xl border border-border-subtle bg-background-app px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary transition-all`; label `text-xs font-medium uppercase tracking-wider text-text-muted`; field error `text-xs text-trust-flagged`
- **Drag-and-Drop Upload Zone**: `flex flex-col items-center gap-4 rounded-2xl border border-dashed px-6 py-12 text-center transition-all` — dragging `border-accent-primary bg-accent-muted`, idle `border-border-subtle bg-surface-card`
- **Wizard Nav Buttons**: primary `flex-1 rounded-xl bg-accent-primary px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg hover:bg-accent-hover active:scale-98 disabled:opacity-40`; secondary/back `flex-1 rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-primary active:scale-98`
- **Recorded-Take Preview** (`CaptureCanvas`): swaps the live `<video autoPlay muted>` for `<video controls playsInline>` inside the same capture canvas frame once `capture.isComplete` — no new container, the 9/16 shell and overlays stay
- **Retake Button** (`CaptureCanvas`): full-width secondary treatment inside the bottom glass panel — `flex w-full items-center justify-center gap-2 rounded-xl border border-glass-border-medium bg-glass-light px-4 py-3 text-xs font-bold uppercase tracking-wide text-text-primary active:scale-98` with a `RotateCcw` icon (`h-4 w-4`)
- **GPS-Denied / Inline Step Error**: `text-center text-xs font-semibold text-trust-flagged` rendered inside the step's own panel (capture bottom overlay, below checkout card, under upload zone) — never a toast
- **Secure-Context Blocked State** (`CaptureCanvas`): when `window.isSecureContext` is false the camera frame reuses the camera-error treatment (`VideoOff` icon + `text-sm font-medium text-text-muted` copy) with dev-setup instructions, and the Start button is hidden entirely
- **GPS Pill States** (`CaptureCanvas` top overlay): `GPS Locked` (dot `bg-trust-verified`) / `GPS Blocked` (permission denied, dot `bg-trust-flagged`) / `Acquiring GPS...` / `GPS Required` — driven by store `coords`, `navigator.permissions` state, and the acquiring flag
- **Async Button Phases** (`CheckoutPrompt`): the primary nav button carries its phase as label text ("Uploading walkthrough..." → "Saving listing..."), both nav buttons `disabled` (`disabled:opacity-70`) while busy
- **Wizard Exit Link** (`CategorySelector` step 1 + Done screen): full-width secondary-button-styled `<Link>` with `ArrowLeft` icon back to `/marketplace/listing`; Done screen's primary action is a primary-button-styled `<Link>` ("View Your Listings") that also fires `reset()` via `onClick`
- **Save Draft Button** (`SaveDraftButton`, wizard shell top-right once a category is chosen): compact secondary treatment `flex items-center gap-2 rounded-xl border border-glass-border-medium bg-glass-light px-4 py-2 text-xs font-bold uppercase tracking-wide` with `Save` icon; busy label "Saving Draft..."; success/failure via sonner `toast` (`import { toast } from 'sonner'` convention)
- **Shared Listing Fieldsets** (`components/listing/ListingFields.tsx`): the category-specific metadata grid + address + base-price fields with the canonical `listingInputClass`/`listingLabelClass`/`listingErrorClass` — consumed by both `MetadataForm` (wizard) and `ListingEditForm` (edit page); never fork these fieldsets
- **Listing Edit Form** (`ListingEditForm`, `/marketplace/listing/[id]/edit`): same max-w-md form card as wizard steps; leads with a padlock notice row (`Lock` icon + `bg-glass-light` pill) explaining video/GPS/documents are sealed; Cancel is a secondary-styled `<Link>`, Save Changes the primary button
- **Owner Card Action** (`ListingCard` with `owner` prop, hub only): full-width secondary mini-button `text-[10px]` with `PencilLine` icon — "Continue Editing" (drafts → wizard `?draft=`) or "Edit Listing" (posted → edit page); never rendered on visitor grids
- **Feed Card Nullable States** (`MarketplaceFeedCard`): avatar falls back to an initial in a `bg-glass-light` circle (`FeedAvatar`); trust-score row hidden when null (no fabricated scores); `<video src>` used directly (webm + mp4)
- **Feed Empty State** (`app/marketplace/page.tsx`): centered `py-20` block — bold title, muted explainer, primary Create Listing CTA

**Pattern notes:** Wizard steps reuse the Base Card Surface (`bg-surface-card`/`border-border-subtle`) for static forms and the Contextual Glassmorphic Panel for anything overlaying the live camera feed — never mix the two for the same element. Emerald (`accent-primary`/`accent-muted`) marks the selected/active/passed state everywhere in the wizard (category card, stepper dot, upload zone while dragging); red (`trust-flagged`) is reserved for the GPS-not-yet-locked dot, never for form validation chrome beyond the existing `text-trust-flagged` error-text convention.

### Listing Hub (My Listings)

- **File Path**: [app/marketplace/listing/page.tsx](app/marketplace/listing/page.tsx)
- **Page Shell**: identical to `/marketplace/profile` — `bg-background-app min-h-[100dvh] w-full flex`, content column `flex-1 flex justify-center md:ml-64 lg:ml-[244px] pb-16 md:pb-0`, inner `w-full max-w-5xl px-4 py-6 md:px-8 md:py-10`
- **Section Header**: title `text-xl font-bold text-text-primary tracking-wide`, subtitle `text-sm text-text-secondary mt-1`, laid out `flex items-center justify-between gap-4 mb-8`
- **Primary CTA ("Create Listing")**: `inline-flex items-center gap-2 rounded-xl bg-accent-primary px-5 py-3 text-xs font-bold uppercase tracking-wide text-text-inverse shadow-lg hover:bg-accent-hover active:scale-98` — shown top-right on desktop, repeated full-width below the grid on mobile (`sm:hidden`)
- **Listings Grid / Empty State**: reuses `components/profile/ListingsGrid.tsx` + `components/profile/ListingCard.tsx` verbatim — do not fork these for the hub; both profile (visitor view) and this hub must stay visually identical since they render the same data shape (`ListingSummary[]`)

**Pattern notes:** This is the first place `ListingsGrid` renders for the *owner's own* listings (previously only used on visitor profile views) — its empty state intentionally has no built-in CTA, so every page embedding it must supply its own "Create Listing" / routing action per `ui-rules.md`'s Empty States rule. Sidebar and bottom-nav both route their "Listing" item here, never straight to the wizard.
