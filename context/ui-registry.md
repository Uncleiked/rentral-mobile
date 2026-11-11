# UI Registry

### Owner/admin decisions and recovery — 2026-11-10

Files: components/admin/AdminWorkspace.tsx, apps/mobile/app/admin.tsx.

| Property | Pattern |
| --- | --- |
| Web panels | `min-w-0 rounded-2xl border border-border-subtle bg-surface-card p-5 sm:p-6` |
| Web fields | `w-full min-w-0 rounded-xl border border-border-subtle bg-background-app p-3 text-sm text-text-primary` |
| Web actions | `min-h-11 rounded-xl border border-border-subtle px-4 py-3 text-sm font-semibold disabled:opacity-50`; semantic accent/inverse for commit |
| Text/status | Primary headings, secondary decision details, muted labels/help; visible inline `role=status` |
| Native panels | `colors.surface`, `colors.border`, `radius.xl`, `space.xl` padding and `space.lg` gap |
| Native type | Inter semibold heading 18; regular help 13/22; semantic warning text for uncertain results |

Current server permissions determine available controls. Written reasons belong
beside the decision, and owner-self exceptions require a separate explicit
acknowledgment. Show fee state as waived/paid/unpaid without conflation. Wrap long
IDs/emails/reasons and preserve newlines. Pending decisions have their own visible
recovery panel; pause new decisions, retain the original actor/nonce/body, read
the receipt first and offer exact retry only after absence is confirmed. A link
to specialized finance does not imply that a listing review moved money.

### Approved gallery creation and photo display — 2026-11-10

Files: components/listing/GalleryListingWorkspace.tsx, components/listing/ListingGallery.tsx,
apps/mobile/app/create-listing.tsx, apps/mobile/src/components/gallery-photos.tsx.

Reuse web surface-card/border-subtle rounded-2xl panels and rounded-xl labeled
fields/minimum-44px actions. Selected media previews sit inside semantic bordered
cards; photo selection/removal and optional video are explicit. Retained server
files are labelled honestly. Native create panels use existing `radius.xl`,
`space.lg`, semantic help/status colors and small bounded thumbnails. Full native
photos use `radius.lg`, contain scaling and a 4:3 presentation with readable
per-image failure/retry guidance.

Always show gallery origin and the absence of recorded GPS proof. Photo-only
listings have a real image surface and no empty video/Mux player. New source/grant
selection is independent of personal KYC. Revoked permissions preserve the draft
and explain the block. Human review, video processing and paid/waived publication
remain separate states. Unknown saves keep their original command for receipt
readback rather than showing success or creating another request.

Raw byte uploads have a separate visible recovery panel. Persist the intended
path/form before upload, read the owned file after interruption or reload, and
require deliberate same-content reselection before exact-path retry. Browser
recovery never implies a completed listing save. A reviewed abandonment explains
that it keeps other work and does not delete server files. Permission revocation
still permits recovery readback while blocking new uploads or saves.

### Manual inspection evidence — 2026-11-10

Files: components/bookings/ManualInspectionReview.tsx,
apps/mobile/src/components/manual-inspection.tsx.

Web evidence uses border-subtle separation, rounded-xl fields/actions and muted
13–14px help. Native uses the standard surface/border/radius.xl/space.xl card,
semibold 19px heading and regular 13/22 help. Preserve multiline statements,
show pending/approved/rejected status in words, and label the evidence as manual.
Explain that review creates no GPS proof or automatic payout. Keep uncertain
submissions actor/booking scoped and read the original receipt before retry.

### Profile photo and address feedback — 2026-11-10

Files: apps/mobile/src/components/avatar-editor.tsx,
apps/mobile/src/components/capture-address-check.tsx,
components/listing/MetadataForm.tsx.

Keep the selected avatar visible until explicit discard or a confirmed profile
save. Use the existing round preview, `space.lg` rhythm, primary/secondary Button
hierarchy and regular 12/21 muted status text; failures use semantic warning.
Product copy says choose/save/remove and retains useful database setup/connectivity
messages instead of claiming that local file storage failed.

Address checks keep the established 17px heading, regular 13/21 help, medium
13/22 status and `space.lg`. Distinguish no result, uncertain building, imprecise
lookup and provider outage with useful correction/retry guidance. A missing
building is not called an outage. Legacy responses use neutral fallback wording.
Neither color nor an icon alone conveys permission, a match or success.

### Rentral identity and native launch — 2026-11-10

Files: components/brand/RentralLogo.tsx, apps/mobile/src/components/BrandLogo.tsx,
LaunchIntro.tsx; canonical geometry/palette: lib/brand/identity.json.

| Property | Pattern |
| --- | --- |
| Mark | One geometric emerald lowercase-r/open doorway; no gradients or tiny details |
| Wordmark | Lowercase rentral, Inter semibold, restrained negative tracking |
| Native sizes | Compact mark36/wordmark25; standard44/30; launch128/36 |
| Surfaces/text | Existing charcoal background, white primary text, emerald semantic accent |
| Native spacing | space.xs inline gap; launch wordmark space.sm below mark |
| Motion | One720ms launch; cubicBezier(0.23,1,0.32,1), opacity/0.96→1 scale;180ms reduced-motion path without scale |
| Fallback | Font4s budget; intro1.5s safety; error/retry fallback releases native splash |

The SVG/native PNG/ICO assets come from one deterministic generator. ICO's
embedded PNG must remain RGBA/32-bit; the iOS icon separately stays opaque RGB.
The intro is outside actor-keyed navigation and cannot wait for backend readiness.

### Capture address and uncertain request recovery — 2026-11-10

Native CaptureAddressCheck uses existing text/muted/accentBright/warning tokens,
17px semibold headings,13px regular explanatory text with21px line height and
13px medium status text with22px line height, separated by space.lg. A displayed
match belongs to the exact current capture/address; edits invalidate it. Unknown
recording/upload/save outcomes have explicit status readback and preserve input.

Web ListingRequestRecovery uses bg-surface-card, border-border-subtle,
rounded-2xl,p-5,gap-3; semantic primary/secondary/muted/flagged text and existing
accent buttons with44px minimum targets. Pending exact commands survive reload
per actor, block competing form commands, and require GET readback before an
explicit same-command retry. Capture marker IDs survive reload; an unsaved
browser Blob survives SPA navigation only, so missing footage asks for a retake.
Live typed fields feed draft saves; actor+wizard generations protect delayed work.

Account-bound workspaces: the marketplace server layout supplies ApiActorScope.
Commerce and matching controls use memoized scoped request hooks. The captured
account restricts existing authentication; it never grants identity or a role.
Changing the captured actor remounts children so old draft commands cannot carry
across accounts. There is no added visual wrapper or theme.

### Commercial purchases and sponsored placements — 2026-11-09

`components/commerce/*` uses the existing surface-card/border-subtle/rounded-2xl
cards with p-5–6, rounded-xl fields, semantic primary/secondary/muted text and
minimum44px actions. Exact kobo formats as NGN; every purchase shows fixed days
and test/live environment. Unknown writes retain their original command and
offer readback before an explicit retry. Provider checkout is an inspected link,
separate from paid/access state. Campaign review, payment and delivery eligibility
remain visibly separate. Insights controls filter event/month groups and export
only the shown thresholded coarse data. Sponsored cards sit outside organic
ranking and visibly retain the Sponsored label.

Dashboard tools expose matching, purchases, Insights, campaigns and refunds.
Native Profile reuses the existing secondary Button and semantic muted help for
the commerce web handoff; it explicitly states separate browser sign-in and
passes no authentication token in the URL. Native sponsored placement patterns
are recorded by the native owner after implementation.

### Member dashboard activity — 2026-11-09

Web `components/account/MemberActivityCards.tsx` and native `app/dashboard.tsx`
use existing surface cards and semantic text. A short label, prominent observed
value and explicit sample explanation form each card. No-sample and truncated
histories display Unavailable. Response captions exclude unanswered turns;
inspection captions describe recorded check-ins, and review counts state their
all-time completed-booking scope. Native cards use radius.xl/space.xl and shared
Page/Button; web uses rounded-2xl/border-subtle/p-5. Counts link to actual archives.

### Native lease management — 2026-11-09

`apps/mobile/app/leases.tsx` and `lease/[id].tsx` use Page, shared Field and
Button, surface/border cards with radius.xl and space.xl padding. Headlines use
20–22px semibold; body 14px/23 secondary; help 12–13px/21 muted; unconfirmed
results use semantic warning text plus a visible history-check action. Date/time
labels state their input format and device time zone. Evidence is private,
10 MB bounded and explicitly uploaded before proposal submission. Counterparty
reasons accompany accept/decline; staff review is a separate recorded step.

### Conversation activity controls — 2026-11-09

`components/messaging/ChatPanel.tsx` retains surface-card, border-subtle,
rounded-2xl and p-4/sm:p-5. Activity is a small muted caption under the member
name, announced politely. A labeled checkbox uses the existing accent and
text-xs muted pattern. It shares only conversation-scoped activity while the
view is visible; opting out clears the actor's ephemeral row. Read indicators
reuse the message timestamp caption. No global last-seen timestamp is exposed.

### Lease requests and lifecycle reviews — 2026-11-09

Canonical pattern: root ui-registry.md entry of the same name. New shared web
components: components/lifecycle/LeaseRequestForm.tsx, LeaseRequestsPage.tsx,
LeaseCounterpartyControls.tsx and components/admin/LifecycleReviewControls.tsx.
Cards reuse surface-card/border-subtle/rounded-2xl/p-5–6; fields reuse app
background/rounded-xl/p-3; labels/help text-xs muted, body/status text-sm secondary.
Actions keep minimum44px targets, accent hover/focus outlines and visible disabled
states. Explicit booking outcomes extend existing ReviewControls. Preserve input
and uploaded evidence on unconfirmed outcomes, with visible history refresh.

### Staff financial workspace — 2026-11-09

Files: components/admin/FinancialWorkspace.tsx, FinancialOperationReview.tsx,
FinancialReceipts.tsx and financial-ui.ts. Shared field/button token strings
match staff reviews: surface-card, border-subtle, rounded-2xl cards p-5/sm:p-6,
rounded-xl fields p-3 with accent focus. Actions min-h-11, px-4/py-3 and visible
focus outlines. Text uses primary/secondary/muted and semantic warning/accent.
Money formats exact BigInt kobo; forms accept NGN with at most two decimals.
Keep source payment IDs selectable/wrapped, available funds separate from totals,
and approval/request/provider outcome distinct. Preserve uncertain immutable
commands and require explicit readback before further instructions. Archive
buttons preserve loaded records. No bank account numbers persist in this UI.

### Native booking details — 2026-11-09

Files: apps/mobile/app/booking/[id].tsx and src/components/booking-*.tsx.
Summary/action cards use theme surface/border, radius24, padding24 and gap16.
Headings20 semibold, labels13 muted, values14 medium; monetary values19 bold
accent with tabular numerals. Error text13 warning. Inspection PIN30 bold with
letter spacing5 is selectable and announced as individual digits. Android uses
the SDK58 date dialog, iOS the date wheel with Done; web retains labeled fields.
Keep rental start/end independent of the holding commitment window. Refresh
explicitly after uncertain writes; disabled controls and visible status explain
unconfirmed results. Listing hold CTA uses the same primary Button.

### Staff role controls — 2026-11-09

File: components/admin/StaffRoleControls.tsx.
Surface: bg-surface-card, border-border-subtle, rounded-2xl, p-5, space-y-4.
Fields: bg-background-app, rounded-xl, p-3, text-sm; semantic accent focus ring.
Labels/help: text-xs text-text-muted; body/status text-sm text-text-secondary.
Primary action: min-h-11, rounded-xl, px-5 py-3, bg-accent-primary,
text-text-inverse, hover:bg-accent-hover, focus-visible outline and pending opacity.
Long member IDs wrap; no personal emails are sent to this client component.
Reuse the existing review form pattern and preserve the reason after failure.

### JWT/MongoDB account and local upload flow — 2026-11-09

The **Local JWT account flow** in root `ui-registry.md` supersedes earlier
Supabase/OAuth/verification entries. Visual tokens stay the same; native account
forms support email/password and one-use reset codes, never KYC. Local upload and
media controls reuse existing Field/Button/StatusView patterns with truthful
permission/progress/retry states. Browser continuation buttons explain that web
sign-in may be needed. Uploaded avatars are verified owner files with relative
public URLs; private walkthrough/document links expire and never contain app JWTs.

### Expo native components — 2026-11-09

Canonical native pattern details are mirrored in root `ui-registry.md` under
**Expo native foundations and components**. Files: `apps/mobile/src/theme.ts`,
`src/components/{Button,Field,Page,StatusView,ListingCard,Walkthrough,BookingRequest,
BookingCard,ConversationCard,MessageBubble,ProfileEditor,ChoiceChips,
NativeListingFields,NativeVideoPreview,WalkthroughCapture}.tsx` and native routes.

- All colors come from semantic native tokens; Inter is bundled. Page background
  and safe areas use background; cards use surface,1px border,24px radius and
 16/24px padding. Heading17–20px, body13/14px, help12/13px muted/secondary.
- Buttons:52px minimum,16px radius, accentBright/inverse; secondary glass/border.
  Inputs:52px minimum,12px radius, surface/border, accent focus; accessible labels.
- Structural/status pills and44px choices use glass or selected accentMuted with
  accentBright text. Booking totals use actual integer-kobo formatting; gross,
  holding credit and additional amount remain distinct.
- Conversation cards use16px radius/padding; own messages accentMuted and other
  messages surface,14px body/10px timestamp. No fabricated read/online states.
- Camera/preview use9:16 media,24px radius and pause on blur/background. Capture
  shows GPS status without raw coordinates; actual MOV/MP4 containers are retained.
- Auth uses the existing local photograph and semantic scrim. Profile fields are
  optional and there are no KYC/onboarding controls. Owner documents are private
  asset evidence; successful submission displays existing review state.

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

### Native booking, member profiles and financial requests (2026-11-09)

Files: apps/mobile/app/booking/[id].tsx, profile/[username].tsx, notifications.tsx,
privacy.tsx, appeals.tsx, financial.tsx, financial-request.tsx, bank-recipient.tsx;
apps/mobile/src/components/booking-*, public-member-view.tsx, member-avatar.tsx,
avatar-editor.tsx, safety-notice-card.tsx and financial-operation-card.tsx.

- Use existing semantic colors/fonts/space/radius tokens with native StyleSheet.
  Cards use surface, border, radius.xl, padding24 and gap16. Screen titles use
  bold30; card headings use semibold19–20; help uses muted12–13 with lineHeight21–22.
- Money uses exact integer kobo formatting, accentBright, bold19–23 and tabular
  numerals. Value/label rows wrap on narrow screens; all controls retain44px targets.
- Native date/time dialogs and iOS wheels use the installed SDK58 Expo UI picker;
  platform review/payout/bank menus use Expo UI Picker and privacy uses Switch.
  Web uses the package fallback controls with accessible labels.
- Public member sections and notification/financial archives use virtualized lists,
  separate archive cursors, explicit older-page controls and visible retry copy.
  Unread notifications use the semantic accent border. Photo previews use88px circles.
- Reviewed safety notices use glass background/warning border and explicit fixed
  public guidance. Reviews never invent a score or imply an ownership guarantee.
  Private report/appeal text is not part of public profile notices.
- Mutation feedback stays inline and selectable. Draft text survives failure;
  unknown outcomes require status readback, and financial retries preserve the
  exact actor-scoped durable request identifier. Confirmed collection, requests,
  approvals, refunds and payouts remain separate visible states.
- Bank account entry is masked and transient, cleared on leaving the form or a
  confirmed save. Only bank code and last four digits appear in saved-recipient UI.
- Verified controlled browser checks cover320/390/768 widths without horizontal
  overflow; these checks do not establish physical-device/provider acceptance.

### Account security and mailbox confirmation (2026-11-09)

Files: components/profile/SecurityCard.tsx,
components/account/EmailConfirmationForm.tsx, app/(auth)/confirm-email/page.tsx.

| Property | Pattern |
| --- | --- |
| Surface | bg-surface-card, border-border-subtle, rounded-2xl, p-6 |
| Fields | bg-background-app, rounded-xl, px-4 py-3, text-sm text-text-primary |
| Focus | focus:border-accent-primary, focus:ring-1 focus:ring-accent-primary |
| Primary action | bg-accent-primary, text-text-inverse, hover:bg-accent-hover |
| Secondary action | bg-glass-light, border-glass-border-medium, hover:bg-glass-light-hover |
| Body/help | text-text-secondary / text-text-muted, text-sm or text-xs |
| Feedback | Inline role=alert text-trust-flagged; role=status text-accent-hover |

All actions retain44px touch targets and wrap on small viewports. Passwords and
codes stay transient; separate mailbox codes never enter URL query strings or
browser persistence. Current inbox, pending confirmation and actual delivery mode
remain distinct. Unknown email-request results require status readback. Session
labels show creation/expiry and identify the current session without inventing
device names. Refresh preserves visible account state on failure. The profile
edit modal links to these controls instead of offering a retired email form.

### Native host drafts, sealed editing and private vault (2026-11-09)

Files: apps/mobile/app/create-listing.tsx, my-listings.tsx, owner-listing/[id].tsx,
vault.tsx; apps/mobile/src/components/NativeListingFields.tsx, WalkthroughCapture.tsx,
owner-listing-card.tsx, owner-listing-editor.tsx and owner-listing-media.tsx.

- Retain semantic surface/border cards, radius.xl,16–24px padding and16px field gaps.
  Full category forms use labeled inputs, wrapping ChoiceChips and SDK58 Expo UI
  menus/switches. Optional fees use decimal keyboards and explicit naira labels.
- Owner inventory uses paginated FlatList cards; vault captures use SectionList
  groups by abstract area and Lagos calendar date. Keep distinct capture IDs even
  when their addresses match. Only one opened walkthrough owns a player.
- Device recovery and server draft confirmation have separate copy. Show a device
  saved timestamp only after secure persistence confirms it. Recording, file copy,
  upload, server save and review submission each expose their current phase.
- Unknown upload/save outcomes retain originals and request identifiers. Controls
  offer explicit status checks and exact-request retry; no fake uploaded media or
  blind new request. An upload can be stopped while preserving its recovery state.
- Posted editors display sealed media/location/document guidance. Unsaved fields
  survive a failed update and stale revisions show comparison/reload choices.
- Archive/restore retains private evidence and financial/booking history. Private
  authority previews request fresh signed access and use the OS document viewer
  from app-private cache on native. Exact saved GPS never enters resume DTOs.
- Camera, precise-location permissions, background interruptions and large-file
  behavior still require physical-device acceptance; isolated tests prove policies
  and native File-body use without claiming a measured device memory result.

### Native account security and code confirmation (2026-11-09)

Files: apps/mobile/app/settings.tsx and confirm-email-change.tsx.

- Account security uses the existing semantic cards and labeled password/email
  fields; current/new password autofill roles are explicit. Sensitive inputs clear
  when leaving a screen and are never device drafts or URL parameters.
- Active sessions use virtualized date-based rows with current-session labels.
  Do not invent device names, IP addresses or locations absent from server data.
- Email changes show actual confirmation flags/deadlines for both addresses.
  The public confirmation screen accepts a typed one-use code with a masked input.
  Development outbox delivery has clear operator guidance without public file paths.
- Server-required sign-in follows confirmed password/email/session results. A
  failed local secure-storage clear has its own retry control and never pretends
  the local session was removed. Unknown mutations are not replayed automatically.
- Shared native Button now retains its explicit accessibility label while its
  activity indicator replaces the visual title.

### Squat-Mates member and independent review surfaces

- Preferences, candidate explanations and privacy histories reuse semantic
  `bg-surface-card`, `border-border-subtle`, `rounded-2xl`, `p-5`, `space-y-5`.
- Form fields/controls use `rounded-xl`, `min-h-11`, muted labels and visible
  accent focus outlines. New visibility remains explicitly unchecked.
- Explain the overlap score with stated area/budget/routine reasons and its
  limits. Never substitute a trust, credit or safety prediction.
- Conversation bubbles preserve newlines and break long words; own messages use
  `bg-accent-muted`. Read times reflect opened messages, not online presence.
- Keep an uncertain send's draft and identifier, check history before retry, and
  clear cached content when current authorization cannot be verified. Redress
  forms can remain without a hidden profile or message payload.
- Staff review/restoration uses the existing written-reason form, fixed privacy
  guidance and status text; matching moderation does not create a public notice.

### Native discovery filters and walkthrough feed

- Advanced filters reuse marketplace policy names, exact-count labels and explicit
  budget validation. Category changes clear incompatible fields; a fresh route
  query avoids carrying stale constraints into the next search.
- The filter form uses native Stack form-sheet presentation, semantic field
  spacing and Expo UI transmission selection. Budgets show naira and the listing's
  stated price period; no exact asset location is requested or displayed.
- Walkthrough pages mount at most one player after an explicit Open action. Focus
  and foreground visibility bound playback; full-height pages use actual scroll
  geometry, while compact/large-type layouts use list viewability. An empty visible
  window never activates the first off-screen item.
- Video starts muted, exposes native playback controls and visible mute/pause
  actions, and offers a fresh-link retry on failure. Keep media errors inside the
  card so they do not hide listing navigation or saving.
- Validated cursor pages retain known content after a temporary refresh failure.
  Saving changes the displayed state only after the desired server acknowledgment.

### Native booking request recovery

- Recovery keeps original dates, booking kind and request identifier visible in
  the existing semantic card. Saved requests block a new form until confirmed or
  deliberately dismissed after history review.
- An uncertain send offers explicit bounded history readback, then an exact retry.
  An acknowledged booking uses a confirmation read without another creation POST.
  Local dismissal explains that it does not cancel any server booking and requires
  a second deliberate confirmation.
- Restore never replays a mutation. Actor-scoped encrypted storage preserves the
  immutable command before sending; storage failures and account changes remain
  visible and never become a successful booking state.

### Native messaging activity and private recovery

- Inbox rows mark unread conversations explicitly and use virtualized cursor
  history. Loading older rows pauses automatic reordering until a deliberate
  refresh; focus refresh resumes live activity.
- Thread headers show coarse online/typing state and disclose periodic updates.
  Presence and typing stop outside the focused foreground conversation. Read
  markers use displayed message identifiers rather than an invented read time.
- Listing shares use a searchable active-listing picker and a removable preview
  before sending. A share can stand alone without fabricated message text.
- Unknown sends preserve the exact body, shared listing and client identifier in
  actor/conversation-scoped encrypted recovery. Checking history and retrying are
  separate actions; local dismissal requires an explicit warning and confirmation.
- Disconnected message windows reset to the latest contiguous page with a visible
  earlier-history explanation. Participant denial clears the cached thread and
  composer; temporary failures retain known content with a retry control.

### Native account export, closure and device searches

- Account export uses the established semantic cards, a native resource picker,
  visible record/page progress, cancellation and an explicit save/share action.
  Files remain in private cache until deliberately removed; no public file URL is
  used. Explain that records and uploaded files are separate and that pages can
  reflect changes made while the export runs.
- Account closure requires a transient masked password, explicit retained-record
  acknowledgment and a separate final confirmation. Known obligations remain
  actionable errors; an unknown result cannot trigger an automatic repeat.
- Saved search cards show readable category/location/budget/count descriptions.
  Label their device-only scope, keep them bound to the signed-in account, and
  distinguish saved filters from saved listings or reservations.

### Native Squat-Mates and private redress

- Matching preferences reuse labeled semantic fields with native Expo UI area
  checkboxes, routine pickers and an unchecked discoverability switch. Group
  native controls inside an explicit Column with shared spacing tokens.
- Candidate cards use the existing avatar/semantic card pattern and exact monthly
  naira budgets. State the overlap percentage as a comparison of declared
  preferences, show its reasons and never present it as a trust or safety score.
- Contact requests display the correct waiting/invited state. Messaging controls
  appear only after acceptance; closing, blocking and hiding visibility have
  separate explicit controls and truthful retained-record explanations.
- Matching message bubbles use the existing secondary/own-accent surfaces,
  preserve line breaks and show read markers only from actual displayed-message
  receipts. Pending sends are encrypted by actor/contact and resolved through an
  echoed client nonce/body or an explicit exact retry.
- Known access changes invalidate cached candidate/contact lists as well as the
  current thread. An unavailable contact can retain minimal private report context
  without showing its hidden profile or messages. Own block/report history stays
  separate and does not claim that unblocking reopens a closed conversation.
# Account records and closure controls

Profile settings use the existing semantic surface-card/border-subtle/text-secondary palette, rounded-2xl cards, 44px minimum controls, and wrapping error/status copy. Resource exports are paged explicit downloads; closure requires a current password and an unchecked-by-default acknowledgement. Buttons disable during the request, stale forms carry the rendered account ID, and uncertain acknowledgements never imply success or automatic mutation retries.

### Native remote updates and first-party privacy

- Remote-update settings reuse semantic surface cards, visible device platform and
  actual registration/revocation dates. Never display Expo tokens or installation
  proof. The inbox remains reachable when remote push is unavailable.
- Permission and registration require a deliberate opt-in on a supported native
  build whose Expo project matches the server. Explain Expo Go, web, disabled
  server and mismatched-project limitations without implying successful enrollment.
- Revocation has an explicit confirmation. An unknown result keeps a private,
  account-scoped recovery record, requires server review before an exact retry,
  and clears only after confirmed server state or explicit local dismissal.
- Generic notification taps open the authenticated inbox. Never trust a push
  payload as a route, account identity or authorization decision.
- Preference analytics starts with persisted opt-out, uses the existing native
  privacy switch, and describes coarse first-party observations and retention.
  Optional telemetry never interrupts browsing or claims a successful payment.

### Native sponsored discovery

- Sponsored cards reuse ordinary listing-card media, save controls, public detail
  routes and semantic typography. Add an explicit Sponsored label, test/live
  placement mode and the approved headline above each card.
- Place paid rows in a separate group with an explanation and a Marketplace
  results heading before organic rows. Paid retrieval never changes organic
  cursor pagination or ordering; unavailable placements have an independent retry.
- Measure an impression only after at least half a row remains visible for one
  second in the focused foreground screen. Explicit clicks open the public asset
  immediately; optional first-party measurement cannot block navigation.
- Respect the same persisted analytics choice and local opt-out intent as coarse
  Insights events. No mount-time impression, automatic event replay, raw query,
  GPS or credential belongs in an observation payload.

### Native owner publication payment

- Submitted owner details include an inline Publication fee card with the exact
  server amount, current Paystack test/live mode and separate recorded-payment
  mode/reference/status. Payment verification never implies publication approval.
- Checkout opens only a validated provider URL bound to the authoritative payment
  ID/reference/environment and captured account/listing. Every browser open checks
  fresh matching server state. A prepared link stays in memory for an explicit
  same-link retry; a new readback invalidates the old rendered capability. A changed
  intent, payment, mode, archive or scope can never revive the old URL.
- Distinguish a historical successful receipt from current-mode fee verification.
  A test or unknown-mode receipt never reads as a verified live publication fee.
- Persist an encrypted actor/listing operation marker before checkout or provider
  verification. Restoration performs no POST. An unknown action requires a
  deliberate server readback before another payment action; a failed readback
  retains recovery. Local storage failure must not send a new payment request.
- Keep ordinary owner metadata, archive, document and review controls native.
  Unavailable payment configuration explains the gate while showing actual
  recorded state; no screen fabricates a paid fee or an active listing.

## Web administration and signup patterns - 2026-11-11

Canonical owner workspace: /admin. Six keyboard tabs separate Listings, Members &
permissions, Organizations, Inspections, Audit trail and More workspaces. Use
semantic surface-card/background-app/border-subtle panels, rounded-2xl containers,
rounded-xl fields,44px minimum controls and desktop queue/detail grids that stack
on phones. Member search fields take a full mobile row. Counts describe the loaded
bounded queue, not platform totals. Focus selected reviews into view.

AdminToggle wraps a native checkbox role=switch with a decorative track/thumb.
A gallery switch prepares a desired state; show the saved state separately and
require Record decision, a reason and the explicit owner-self acknowledgment.
Use checkboxes for evidence attestations, not for service availability. Unknown
commands preserve original actor-scoped receipts/readback and never auto-replay.
Current permission matrices determine available actions and default selections.

AuthForm keeps email/password and one Google alternative; new accounts first
choose native Individual/Organization radio cards and accept terms/privacy.
Unconfigured Google is visibly unavailable while email stays usable. Registration
proof and review statuses are separate from identity/location/asset ownership.
Organization forms and queues use the same semantic fields, clear unavailable
states, exact evidence links and explicit independent approval checklists.

UI verification uses the actual four bundled Inter weights and320/390/768/1440px.
The isolated admin fixture uses only synthetic records and blocked external calls;
it is not an authenticated production route or an authorization bypass.