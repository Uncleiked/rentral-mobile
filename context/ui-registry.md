# UI Registry

### Holding credit and rental balance

Updated 2026-11-07. Files: `components/bookings/BookingRequestForm.tsx`, `BookingControls.tsx`, `ListingBookingActions.tsx`, booking details/new routes.

- Credit summaries match booking surfaces: `rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-7`; compact notices use `rounded-xl bg-background-app p-4`.
- Financial labels use `text-sm text-text-muted`, values use `font-semibold`; format all amounts from integer kobo with `formatKobo`. Display gross total separately from paid hold credit and additional payment.
- Conversion actions use existing `min-h-11 rounded-xl` controls, `bg-accent-primary text-text-inverse`; supporting links use `text-accent-primary underline underline-offset-4`.
- A holding notice remains `border-glass-border-warning bg-glass-warning text-text-secondary`. Its continuation link resolves the current user's own hold on the server without displaying another renter's identity.
- Same-date conversion fields are disabled and seeded from the original server dates. Sending a request consumes no credit. Cancellation/expiry language explains settlement review without claiming a provider refund or payout.

### Responsive marketplace, listing detail and profile surfaces

Updated 2026-11-07. Files: `components/layout/MarketplaceShell.tsx`, `components/feed/*`, listing detail and profile views.

- Top navigation: `bg-background-app/95 backdrop-blur-xl border-b border-border-subtle`; mobile navigation includes safe-area padding. No reserved left gutter or fabricated suggestions.
- Editorial titles: `text-3xl sm:text-4xl font-semibold tracking-tight`; eyebrow: `text-[10px] uppercase tracking-[0.2em] text-accent-hover`.
- Grid previews: `rounded-2xl border border-border-subtle bg-surface-card`; protected posters are `unoptimized`. Hover uses `duration-700 group-hover:scale-105`.
- Search uses semantic surface pills, explicit labels and viewport-bounded filter popovers. Controls retain `min-h-11` touch targets.
- Primary actions: `rounded-full bg-accent-primary px-5 py-3 text-xs font-semibold text-text-inverse hover:bg-accent-hover`; secondary: `border-border-subtle hover:bg-glass-light`.
- Saved hearts reflect persisted results. Unavailable controls explain why. Walkthrough playback is user initiated. Native/copy sharing reports failure.
- Detail fee rows, host records and reviews display projected real data. Neighborhoods obscure street addresses; identity badges never guarantee ownership/condition.
- Owner profiles show actual assets plus bookings/saved/activity shortcuts. No fabricated balance, lease, credit, license, followers or device count is rendered.

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

### Listing Video and Processing State

Files: `components/listing/ListingVideo.tsx`, `components/listing/MediaProcessingStatus.tsx`, `components/profile/ListingCard.tsx`
Last updated: 2026-09-24

- Media stays within existing `aspect-[4/3]` cards and `aspect-[4/5]` feed surfaces.
- Loading/error surfaces: `bg-background-app text-sm text-text-muted` or `text-text-secondary`, centered with `role="status"`.
- Retry/refresh uses Lucide RefreshCw in a stable icon button, with title and accessible label; no fake percent progress.
- Owner processing status: unframed `border-t border-border-subtle pt-2 text-xs text-text-secondary`; errors use `text-trust-flagged`.
- Cards no longer claim every recording is a verified 120-second walkthrough. Labels distinguish draft, walkthrough and confirmed video-ready state.
- Uncertain save responses retain files and link to Your Listings instead of inviting duplicate submission. Existing semantic auth/listing styling is retained.
- Signed playback is fetched from an authenticated no-store endpoint and renews before expiry. No public raw-video fallback is used for submitted listings when Mux is enabled.
- Private-media follow-up: saved draft, profile and feed media use same-origin
  authorized URLs. Protected posters must have `unoptimized` so they retain viewer
  credentials and never enter the shared Next image cache.
- Native/Mux error surfaces use `bg-background-app text-sm text-text-secondary`,
  `px-4 gap-2`, centered within the existing media frame. Retry icons use `h-4 w-4`
  inside `h-10 w-10 rounded-lg bg-glass-light hover:bg-glass-light-hover` buttons,
  with `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary`.
  Keep the accessible label/title "Retry video" and `role="status"` message.
- Resumed CaptureCanvas previews take precedence over a denied live-camera request;
  failed previews use the same retry pattern without changing the 9/16 frame.
- Live media-state screenshots/playback remain staging acceptance work; public/auth viewport checks cover disabled-mode compatibility only.
- Background worker follow-up: no new UI component or styling variation. The worker
  writes the same media states consumed here; owner refresh/retry and pending-review
  behavior are unchanged. Public/auth responsive compatibility was rechecked across
  320, 390, 768 and 1440px, including the internal endpoint's anonymous-access guard.

### Sign-In Feedback and Provider Availability

Files: `app/(auth)/sign-in/AuthForm.tsx`, `app/(auth)/sign-in/page.tsx`
Last updated: 2026-09-24

- Retains `bg-surface-card border border-border-subtle`, existing input/action tokens, and responsive `p-6 sm:p-8` spacing.
- Errors persist below the actions using `role="alert"` and `text-sm text-trust-flagged break-words`; provider internals are never rendered.
- Form submission supports Enter, `aria-busy`, disabled actions and visible pending copy. OAuth exceptions reset pending state.
- OAuth buttons render only for enabled Supabase providers. Loading provider settings has a visible `role="status"` fallback; failures leave email login available.
- Marketplace avatar images declare fixed `sizes` (44px suggestions, 40px feed); sidebar branding uses intrinsic SVG dimensions and `h-10 w-auto` to preserve aspect ratio.

### Foundation Forms and Submission States

Files: `components/onboarding/ProfileForm.tsx`, `components/profile/EditProfileModal.tsx`, `components/listing/CheckoutPrompt.tsx`, `app/marketplace/error.tsx`
Last updated: 2026-09-24

| Property | Class |
| --- | --- |
| Form surface | Existing `bg-surface-card border border-border-subtle` |
| Inputs | `bg-background-app border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary` |
| Labels | `text-xs font-medium uppercase tracking-wider text-text-muted` |
| Focus | `focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary` |
| Primary action | `bg-accent-primary text-text-inverse hover:bg-accent-hover` |
| Secondary action | `bg-glass-light border border-glass-border-medium text-text-primary` |
| Error feedback | `text-xs text-trust-flagged` |
| Spacing | Form `space-y-6`; fields `gap-4`; actions `px-4 py-3` |

Pattern notes: Retain the homepage's semantic brand tokens and existing auth surface. Form labels associate with input IDs. Inputs in constrained rows can shrink using `min-w-0`. Profile completion advances from confirmed server state. Listing submission has no fabricated bank details, payment receipt or countdown; pending listings remain absent from discovery. Marketplace failures use an unframed, centered error state with a Lucide retry action. Homepage and recovery-route viewport checks passed at 320, 390, 768 and 1440 pixels; this does not assert full authenticated-form visual acceptance.

### Registry Authority

This is the canonical registry required by AGENTS.md. The root `ui-registry.md` contains historical profile-component patterns; consult those until migrated here. Earlier entries below with raw color classes or obsolete paths are historical observations, not permission to bypass semantic tokens.

### Navigation & Header

- **Files**: `components/home/HomeNavigation.tsx`, scoped `.rentral-home` CSS; updated 2026-11-07.
- **Header**: full-width transparent hero header with `border-glass-border-light`, Inter wordmark, restrained `text-sm font-medium text-text-secondary` links.
- **Sign-in**: `home-nav-signin`, using `bg-text-primary text-text-inverse`, rounded pill, 13px semibold.
- **Mobile menu**: `bg-surface-card border-border-subtle`, 20px radius, 52px-high links, native button expanded state, Escape/outside dismissal. Desktop navigation starts at `lg`.
- **Logo Image**: `h-8 w-auto brightness-0 invert`; intrinsic dimensions preserve its aspect ratio.

### Hero Layout

- **Current files/pattern (2026-11-07)**: `app/page.tsx`, `components/home/HomeMotion.tsx`; full-bleed local illustrative image with semantic brand/background gradient. Inter 44-128px fluid title, medium/light weights, tight tracking, small uppercase eyebrow.
- **Current motion**: GSAP image-mask expansion, heading entrance, modest parallax, section reveals. Scoped context/media cleanup; reduced-motion users receive visible static content.
- **Search**: brand-vault-muted surface, glass-medium border, 24px radius, 17px padding. Labelled category radios and native GET search. Active radio uses glass-light; submit uses accent-primary/inverse.
- **Category cards**: 18px image radius, glass-dark labels/arrows, 21px medium title, 13px muted copy. Photos are explicitly illustrative.
- **CTA**: `home-button-primary`, semantic emerald/inverse, 12px semibold, 54px minimum height, rounded pill, emerald hover and 0.98 active scale.
- **Sections/footer**: app surface for editorial sections, brand-vault-muted trust section, subtle dividers. Current details in `context/homepage-implementation.md`.

Historical hero observations below are superseded by the current patterns above.

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

### Platform workspaces and privacy controls (2026-11-07)

Files: components/messaging/ChatPanel.tsx, components/admin/ReviewControls.tsx,
components/trust/BookingFeedback.tsx, components/notifications/NotificationItem.tsx,
components/privacy/AnalyticsPreferences.tsx, components/renewals/RenewalForm.tsx.

- Surface: bg-surface-card, border border-border-subtle, rounded-2xl, p-5/p-6.
- Primary action: bg-accent-primary text-text-inverse rounded-xl px-5 py-3;
  pending controls disabled:opacity-50, visible inline status/error copy.
- Inputs: bg-background-app border-border-subtle rounded-xl p-3 text-sm;
  labels text-text-secondary, help text-text-muted, error text-trust-flagged.
- Chat: sender bg-accent-muted, other participant bg-background-app, rounded-2xl;
  bounded scrolling, wrap long messages, preserve drafts on failed delivery.
- Scope: staff controls render after server authorization; provider/configuration
  gaps are honest unavailable states. No fabricated scores, balances or payment success.
- Public guidance uses PublicPage with the same tokens; privacy consent defaults off.
- Listing address edits return to review and confirmed bookings prevent relocation.

### Holding status and booking availability (2026-11-07)

Files: components/listing/ListingBookingActions.tsx, components/feed/ListingGridCard.tsx.
Cards show a semantic-accent on-hold badge. Details show the deadline and pause
new booking controls while preserving walkthrough, save and contact access. Only
the deadline is public; the holder identity is never projected. Flexible holding
days and original quoted fees stay visible in booking details; actual credit or
compensation is never presented as settled before provider execution.

### Reviewed safety notices and appeals (2026-11-07)

Files: components/trust/SafetyNoticeBanner.tsx, SafetyAppealForm.tsx,
SafetyNoticeControls.tsx, SafetyAppealControls.tsx, SafetyNoticeAdminQueue.tsx.

- Review surfaces: bg-surface-card, border-border-subtle, rounded-2xl, p-5/p-6.
- Caution banner: bg-glass-warning, border-glass-border-warning, rounded-2xl,
  px-4 py-4, text-text-primary. Fixed copy only; never expose report/evidence text.
- Fields: bg-background-app, border-border-subtle, rounded-xl, p-3, text-sm;
  focus:border-accent-primary focus:ring-1 focus:ring-accent-primary.
- Actions: min-h-11 rounded-xl px-5 py-3, primary bg-accent-primary
  text-text-inverse, hover:bg-accent-hover, disabled:opacity-50. Visible focus
  outlines and inline role=status feedback. Full width mobile; sm:w-auto.
- Text: text-text-secondary body; text-text-muted help; whitespace-pre-wrap and
  break-words for member submissions. Stack forms/cards on narrow viewports.
- Staff review creates notices; low ratings and report submission alone never
  render caution banners. Affected accounts can appeal even after KYC revocation.

### Compliance document privacy boundary (2026-11-07)

Backend-only Storage hardening introduces no new UI component or visual pattern.
Existing document upload/preview controls retain their established semantic tokens.
Documents stay owner-private; private originals must never gain a public fallback
when an authorization or preview request fails.
# Build configuration checkpoint — 2026-11-07

Prisma generation is now part of `pnpm build`. No UI components, tokens, layout,
motion or responsive patterns changed in this build fix.
