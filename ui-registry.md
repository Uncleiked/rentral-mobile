# Rentral UI Registry

### Owner/admin, gallery and manual review — 2026-11-10

Canonical detailed patterns: [current registry](context/ui-registry.md), entries
**Owner/admin decisions and recovery**, **Approved gallery creation and photo
display**, **Manual inspection evidence**, and **Profile photo and address feedback**.

Web admin/gallery panels use `bg-surface-card border-border-subtle rounded-2xl
p-5 sm:p-6`; fields reuse `bg-background-app rounded-xl p-3 text-sm` and semantic
text. Actions keep `min-h-11`, rounded-xl borders and disabled opacity; commit
uses the existing semantic accent/inverse pair. Long IDs, emails and multiline
reasons wrap. Native panels use `colors.surface/colors.border`, `radius.xl`,
`space.xl` and `space.lg`; Inter semibold headings and regular 13/22 help match
existing member workflows. Gallery images use contained media and semantic
surfaces, not an empty player for photo-only listings.

Show human decisions, gallery origin, unverified recording location and
paid/waived/unpaid state explicitly. Owner-self review has its own acknowledgment;
other participant/financial independence remains. Unconfirmed decisions/evidence/
listing saves have a visible recovery state and preserve the original actor and
request before readback/exact retry. Retain the selected avatar on failure.
Gallery raw-upload recovery persists its intended path before bytes, preserves
the form across reload and requires owned-file readback before a deliberate
same-content/path retry. Show it separately from listing-command recovery;
reviewed abandonment never claims server deletion.
Address failure wording distinguishes missing/uncertain/imprecise data from an
outage and remains neutral for legacy responses. Keep technical provider details
and coordinates out of these product flows.

### Rentral identity, opening reveal and recording recovery — 2026-11-10

Canonical patterns: context/ui-registry.md entries of the same date. Reuse
components/brand/RentralLogo.tsx and native BrandLogo/BrandMark rather than
independent wordmarks. Artwork/palette lives in lib/brand/identity.json; generate
icons using scripts/generate-brand-assets.mjs. Keep lowercase Inter semibold,
charcoal/white/emerald and generous mark negative space. Native launch720ms,
reduced180ms without scale; bounded fallbacks and no backend wait/foreground replay.

CaptureAddressCheck uses native existing semantic text/status colors,17px heading,
13px explanatory/status text and space.lg. ListingRequestRecovery uses web
surface-card/border-subtle/rounded-2xl/p-5/gap-3, semantic text and44px actions.
Known match, mismatch, unavailable and unconfirmed are distinct states. Preserve
exact pending commands/nonce per actor; read before explicit retry. Browser-camera
Blob recovery is memory-only across SPA navigation, never claimed after reload.

### Member dashboard activity

Files: components/account/MemberActivityCards.tsx, apps/mobile/app/dashboard.tsx.
Updated 2026-11-09. Keep surface/border cards, prominent value below a muted
caption, then a short sample explanation. Native radius.xl/space.xl; web
rounded-2xl/p-5. Missing or incomplete samples show Unavailable. Do not style
these observations as a credit score or guarantee of attendance.

### Native lease management

Files: apps/mobile/app/leases.tsx and lease/[id].tsx. Updated 2026-11-09.
Use Page/Field/Button; surface cards, border token, radius.xl, space.xl padding;
20px semibold heading, 14px secondary body, 12px muted help. Unknown results keep
input visible with warning text and an explicit history-check action. Evidence
links request fresh access, and proposed dates show device time zone.

### Conversation activity controls

File: components/messaging/ChatPanel.tsx. Updated 2026-11-09.
Keep surface-card / border-subtle / rounded-2xl / p-4 with muted text-xs status
below the member name. Privacy control is a labeled accent checkbox with a
text-xs muted label; read receipts remain part of the existing timestamp caption.
Presence is advisory and scoped to the visible conversation.

### Lease requests and lifecycle reviews — 2026-11-09

Files: components/lifecycle/*, components/admin/LifecycleReviewControls.tsx,
components/admin/ReviewControls.tsx, marketplace renewal/termination/staff routes.

| Property | Pattern |
| --- | --- |
| Cards | bg-surface-card, border-border-subtle, rounded-2xl, p-5/p-6, space-y-5 |
| Fields | bg-background-app, border-border-subtle, rounded-xl, p-3, text-sm text-text-primary |
| Labels/help/status | text-xs text-text-muted; body/status text-sm text-text-secondary |
| Primary action | min-h-11, rounded-xl, px-5 py-3, bg-accent-primary, text-text-inverse |
| Interaction | hover:bg-accent-hover; semantic focus-visible outline with offset; disabled:opacity-50 |
| Secondary action | min-h-11, rounded-xl, border-border-subtle, text-text-secondary/accent-hover |

Keep original/proposed lease dates and provider payment evidence distinct.
Retain documents/form values on failure; unconfirmed creates block resubmission
while request history refreshes. Counterpart agreement and independent staff
review remain separate. Incident acknowledgement never implies a resend, booking
change or financial movement. Private documents open only through scoped links.

### Completion build patterns — 2026-11-09

Native booking summaries, inspection PIN/date controls and current-role staff
forms are captured in context/ui-registry.md. Use native semantic theme tokens
and existing Button/Field primitives, and the staff review form's semantic web
surface/border/accent/focus states. Do not infer public identity verification from
sign-in or use historical KYC fields as a publication prerequisite.

### Local JWT account flow — 2026-11-09

The native/web account forms now use local JWT email/password accounts backed by
MongoDB. Existing Button/Field/Page tokens remain unchanged. There are no OAuth,
email-confirmation or KYC steps. Sign-up opens Explore directly; password recovery
uses a one-use reset code and the existing accessible inline error/status pattern.
For local development only, recovery codes are written to the backend's private
email outbox. Native sessions stay encrypted in SecureStore; private user data is
cleared on sign-out. Browser booking/draft continuation opens the existing web
screen with a clear sign-in notice. Media resolves against the device-reachable
API host; local public avatars use verified relative paths.

### Expo native foundations and components — 2026-11-09

Files: `apps/mobile/src/theme.ts`, `src/components/*`, `app/(auth)`, `app/(tabs)`.
Native equivalents of the web semantic tokens are centralized in `theme.ts`;
React Native StyleSheet replaces web utility-class syntax. Inter is bundled.

| Component | Consistent visual pattern |
| --- | --- |
| Page / RootNavigator / tab layouts | `colors.background`, safe areas,24px content padding, Inter semibold30px headings, muted14px supporting copy; active tabs accentBright. |
| Button | accentBright/inverse, radius16,52px minimum height, semibold14px; secondary glass/border; visible disabled/busy states. |
| Field | surface/border, radius12,52px minimum height,16px horizontal padding, regular15px text, medium13px label, accent focus border. |
| StatusView | glass circular icon, semibold17px title, muted14px message, visible loading/retry. |
| ListingCard | surface/border, radius24,16px content padding, title19px, emerald21px price,11px glass structural pills; private images use signed media. |
| Walkthrough / NativeVideoPreview / WalkthroughCapture | background/surface, radius24, native aspect-ratio media, muted13px help, visible recording/GPS status without raw coordinates; pause on blur/background. |
| BookingRequest / BookingCard | surface/border, radius24,24px padding;17–20px headings,13px body; actual total/hold credit/additional payment separate, amount20px accentBright. |
| ConversationCard | surface/border, radius16,16px padding; accentMuted avatar; visible last message/time with no invented online state. |
| MessageBubble | own accentMuted, other surface, radius16,16px padding,14px body/10px time; real read state only. |
| ProfileEditor | surface/border, radius24,24px padding,17px section title; optional username/bio; save feedback and email display. |
| ChoiceChips / NativeListingFields / owner screens |44px pill choices with accentMuted/accentBright selection; shared fields/buttons,16/24px spacing; real draft/review statuses and retained upload errors. |

Sign-in uses the existing local hero photograph, a glass scrim and sentence-case
actions. The app icon is rasterized from the existing Rentral vector. There are
no identity-document/onboarding controls. Asset ownership documents remain private
listing inputs. These patterns are mirrored in `context/ui-registry.md`.

### Responsive marketplace and profiles (2026-11-07)

Canonical details are in `context/ui-registry.md`. `MarketplaceShell` uses one top navigation and a safe-area-aware mobile bottom navigation. Grid previews use `rounded-2xl border-border-subtle bg-surface-card`; actions use semantic emerald pills. Search is URL driven and filter panels stay within the viewport. Protected media remains unoptimized and walkthrough playback is explicit. Profiles use actual assets and completed-booking reviews; fabricated financial, followers and security counts are removed from rendered views.

This registry enforces UI consistency across the project. It documents the visual patterns that matter for consistency.

## Baseline — Established 2026-06-27

### Hero Background Wrapper

File: `components/ui/HeroBackground.tsx`
Last updated: 2026-06-27

| Property         | Class           |
| ---------------- | --------------- |
| Background       | `bg-brand-vault`|
| Graphics         | `hero-line-field`, `hero-hover-scrim` |
| Z-Index          | `relative isolate overflow-hidden` (container), `relative z-10` (content) |

**Pattern notes:**
This legacy wrapper remains available for auth pages. The 2026-11-07 homepage uses the scoped cinematic patterns in the canonical `context/ui-registry.md` instead.

### Glass Button Primary
File: `components/home/*`, `app/page.tsx`
Last updated: 2026-11-07

| Property         | Class           |
| ---------------- | --------------- |
| Background       | `bg-accent-primary` |
| Text             | `text-text-inverse`, 12px semibold |
| Interactive      | `home-button-primary`, emerald hover, 0.98 active scale; 54px minimum height, rounded pill |

### Glass Button Secondary
File: `components/home/HomeNavigation.tsx`
Last updated: 2026-11-07

| Property         | Class           |
| ---------------- | --------------- |
| Background       | `home-nav-signin`: `bg-text-primary`, glass-medium border |
| Text             | `text-text-inverse`, 13px semibold |
| Interactive      | Rounded pill, secondary-text hover surface, visible emerald focus |

### Marketplace Feed Card (Instagram Style)
File: `components/feed/MarketplaceFeedCard.tsx`
Last updated: 2026-06-27

| Property         | Class           |
| ---------------- | --------------- |
| Card Container   | `w-full bg-background-app border-b border-border-subtle pb-6 mb-2` |
| Video Container  | `w-full aspect-[4/5] bg-black rounded-md overflow-hidden relative cursor-pointer` |
| Action Icons     | `h-6 w-6 text-text-primary hover:text-text-muted active:scale-95 transition-all` |
| Avatar           | `relative h-9 w-9 rounded-full overflow-hidden border border-glass-border-medium` |
| Username Text    | `text-sm font-semibold text-text-primary` |

**Pattern notes:**
This represents the Instagram-style scrollable feed where actions (like, message, share, bookmark) sit below a 4:5 aspect ratio video. Tapping the video expands it to full-screen (TikTok style).

### Marketplace Sidebar
File: `components/feed/MarketplaceSidebar.tsx`
Last updated: 2026-06-27

| Property         | Class           |
| ---------------- | --------------- |
| Container        | `w-[244px] h-[100dvh] border-r border-border-subtle bg-background-app` |
| Nav Link         | `flex items-center gap-4 px-3 py-3 rounded-lg hover:bg-[#1a1a1a] active:scale-95 transition-all` |
| Nav Icon (Idle)  | `stroke-[1.5px] text-text-primary` |

### Profile Form (Onboarding)
File: `components/onboarding/ProfileForm.tsx`
Last updated: 2026-06-28

| Property         | Class           |
| ---------------- | --------------- |
| Form Container   | `bg-surface-card border border-border-subtle rounded-2xl shadow-2xl` |
| Labels           | `text-xs font-medium uppercase tracking-wider text-text-muted` |
| Inputs           | `bg-background-app border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:ring-1 focus:ring-accent-primary` |
| Validation Error | `text-xs text-trust-flagged` |
| Submit Button    | `bg-accent-primary text-text-inverse text-xs font-bold uppercase tracking-wide hover:bg-accent-hover active:scale-95 shadow-lg` |

**Pattern notes:**
This component adheres precisely to the established form patterns defined in `OnboardingForm.tsx`, ensuring consistent typography, input fields, and validation feedback messages across the onboarding flow.

### Profile Avatar (Initials Circle)

File: `components/profile/ProfileAvatar.tsx`
Last updated: 2026-07-17

| Property         | Class           |
| ---------------- | --------------- |
| Background       | `bg-surface-card` |
| Border           | `border-2 border-accent-primary` (individual) / `border-2 border-accent-warm` (organization) |
| Border radius    | `rounded-full` |
| Text — primary   | `text-accent-hover` (individual) / `text-accent-warm` (organization), `font-bold` |
| Spacing          | `h-24 w-24 text-2xl` (lg) / `h-11 w-11 text-sm` (md) |

**Pattern notes:**
Colored ring maps to real `accountType` from the DB — emerald for individuals, warm accent for organizations. Reused anywhere a user identity needs a circular avatar without an uploaded photo.

### Dashboard Card (Owner Profile)

File: `components/profile/DashboardCard.tsx`
Last updated: 2026-07-17

| Property         | Class           |
| ---------------- | --------------- |
| Background       | `bg-surface-card` |
| Border           | `border border-border-subtle` |
| Border radius    | `rounded-2xl` |
| Text — primary   | `text-xs font-bold uppercase tracking-wider text-text-muted` (card title) |
| Spacing          | `p-6`, `gap-4` between sections |

**Pattern notes:**
Matches the "Base Card Surface" spec in `ui-rules.md` exactly (32px radius, 24px padding). This is the standard wrapper for every owner-dashboard tile (escrow, lease, credit, inspections, saved searches, security) — always compose new dashboard tiles from this component rather than rebuilding the surface.

### Trust Stats Bar

File: `components/profile/TrustStatsBar.tsx`
Last updated: 2026-07-17

| Property         | Class           |
| ---------------- | --------------- |
| Background       | `bg-accent-primary` (solid, not glass) |
| Border radius    | `rounded-2xl` |
| Text — primary   | `text-text-inverse font-extrabold` (value) |
| Text — secondary | `text-text-inverse text-[10px] font-bold uppercase tracking-wider` (label) |
| Spacing          | `px-5 py-5`, cells `gap-4` |

**Pattern notes:**
The one place the app uses a solid emerald surface instead of glass/dark-card — reserved for the public trust-score strip on visitor profiles. Deliberately avoids opacity-stacked text (e.g. `text-text-inverse/70`) per the ui-rules "no manual opacity stacking" rule; hierarchy comes from size/weight only.

### Profile Header (Owner & Visitor)

File: `components/profile/OwnerProfileHeader.tsx`, `components/profile/VisitorProfileHeader.tsx`
Last updated: 2026-07-17

| Property         | Class           |
| ---------------- | --------------- |
| Verified badge   | `bg-trust-verified` circle with white checkmark svg (extracted to `VerifiedBadge.tsx`) |
| Stat pill        | `rounded-full bg-accent-muted border border-glass-border-success px-3 py-1 text-xs font-semibold text-accent-hover` |
| Meta pill        | `rounded-full bg-glass-light border border-glass-border-light px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-text-secondary` |
| Primary button   | `rounded-lg px-4-5 py-2-3 text-sm font-bold bg-accent-primary text-text-inverse hover:bg-accent-hover active:scale-95 shadow-lg` |
| Secondary button | `rounded-lg px-4-5 py-2-3 text-sm font-semibold bg-glass-light border border-glass-border-medium text-text-primary hover:bg-glass-light-hover active:scale-95` |

**Pattern notes:**
Primary/secondary action buttons here are sentence-case (`Follow`, `Edit profile`, `Share`), not the uppercase/tracking-wide style documented for the hero "Book Physical Verification" CTA in `ui-tokens.md`. This matches the precedent already set by `MarketplaceFeedCard.tsx`'s `Book` button — sentence-case is the correct pattern for inline social/profile actions; uppercase+tracking is reserved for standalone hero-level CTAs.

### Profile Listing Card

File: `components/profile/ListingCard.tsx`, `components/profile/ListingsGrid.tsx`
Last updated: 2026-07-17

| Property         | Class           |
| ---------------- | --------------- |
| Background       | `bg-surface-card` |
| Border           | `border border-border-subtle` |
| Border radius    | `rounded-xl` |
| Badge (overlay)  | `bg-glass-dark backdrop-blur-sm border border-glass-border-light rounded-full px-2.5 py-1 text-[10px] font-bold uppercase` |
| Structural badge | `bg-glass-light border border-glass-border-light rounded-full px-2 py-0.5 text-[10px] font-medium` |

**Pattern notes:**
Grid variant of the feed card for a profile's listings tab — same badge/price/title language as `MarketplaceFeedCard.tsx` but static (image, not video) and denser (grid-cols-2/3 instead of single-column feed).

### Profile Tabs

File: `components/profile/ProfileTabs.tsx`
Last updated: 2026-07-17

| Property         | Class           |
| ---------------- | --------------- |
| Container        | `flex items-center gap-6 border-b border-border-subtle` |
| Active tab       | `text-text-primary border-b-2 border-text-primary` |
| Inactive tab     | `text-text-muted hover:text-text-secondary` |
| Text             | `text-xs font-bold uppercase tracking-wider` |

**Pattern notes:**
Client component (`useState` tab switching). Reuse this exact underline-tab pattern for any future segmented content view instead of inventing pill-style tabs.

### Modal Dialog (Edit Profile)

File: `components/profile/EditProfileModal.tsx`
Last updated: 2026-07-17

| Property         | Class           |
| ---------------- | --------------- |
| Overlay          | `fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm` |
| Panel            | `bg-surface-card border border-border-subtle rounded-2xl shadow-2xl p-6` (matches Base Card Surface) |
| Panel sizing     | `w-full max-w-md max-h-[90vh] overflow-y-auto` |
| Close button     | `h-8 w-8 rounded-full hover:bg-glass-light-hover active:scale-95` |
| Section divider  | `h-px bg-border-subtle` |
| Read-only input  | `bg-surface-card border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-muted cursor-not-allowed` |

**Pattern notes:**
Editable fields reuse the exact input classes from the onboarding "Profile Form" entry above. Read-only KYC fields (full name, DOB, phone, country) get a visually distinct muted/disabled variant so it's obvious at a glance which fields can't be changed — never render a locked field with the same active-input styling as an editable one. This is the app's first modal dialog; use this overlay+panel structure for any future dialog rather than inventing a new one. `zodResolver` needs an `as never` cast on both the schema argument and the return value due to a zod 4 / @hookform/resolvers 5 type mismatch (same root cause as the pre-existing `as any` casts in `ProfileForm.tsx` — `as never` avoids adding new `no-explicit-any` lint errors).

### Dropdown Menu (Share / Settings)

File: `components/profile/ShareMenu.tsx`, `components/profile/SettingsMenu.tsx`

| Property         | Class           |
| ---------------- | --------------- |
| Trigger (icon)   | `h-9 w-9 rounded-full bg-glass-light border border-glass-border-medium hover:bg-glass-light-hover active:scale-95` |
| Trigger (labeled)| `px-4 py-2 rounded-lg text-sm font-semibold bg-glass-light border border-glass-border-medium hover:bg-glass-light-hover active:scale-95` |
| Panel            | `absolute right-0 mt-2 w-56 z-50 bg-surface-card border border-border-subtle rounded-xl shadow-2xl overflow-hidden` |
| Menu item        | `w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-[#262626] text-left` |
| Item separator   | `border-t border-border-subtle` (on every item after the first) |
| Destructive item | `text-trust-flagged` (e.g. Sign out) |

**Pattern notes:**
Both menus close on outside-click via a `mousedown` listener on a wrapping `ref` div — reuse that exact effect instead of a UI library's dropdown/popover primitive, since the project has none installed. This is the standard dropdown shape for the app; any future "..." or labeled dropdown trigger should match it exactly.

### Avatar Upload Affordance

File: `components/profile/AvatarUploadButton.tsx`

| Property         | Class           |
| ---------------- | --------------- |
| Edit badge       | `absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-accent-primary text-text-inverse border-2 border-background-app hover:bg-accent-hover active:scale-95` |

**Pattern notes:**
Wraps `ProfileAvatar` with a small floating camera-icon badge, only ever rendered on the owner's own header. The file input itself is visually hidden (`className="hidden"`) and triggered via a ref — never render a raw unstyled `<input type="file">`.

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

| Property | Class |
| --- | --- |
| Review surfaces | bg-surface-card border border-border-subtle rounded-2xl p-5 |
| Public caution | bg-glass-warning border border-glass-border-warning rounded-2xl px-4 py-4 text-text-primary |
| Body / help | text-sm text-text-secondary leading-relaxed / text-xs text-text-muted |
| Fields | bg-background-app border-border-subtle rounded-xl p-3 text-sm |
| Field focus | focus:border-accent-primary focus:ring-1 focus:ring-accent-primary |
| Primary action | min-h-11 bg-accent-primary text-text-inverse rounded-xl px-5 py-3 hover:bg-accent-hover |
| Button focus | focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-hover |
| Pending controls | disabled:opacity-50 and visible role=status feedback |

Pattern notes: mobile forms stack with full-width actions, widening at sm; long
statements wrap and preserve newlines. Warning copy is fixed, never a raw report.
Public warnings require an active staff-reviewed finding; rating averages alone
must not create a warning. Member and staff forms share the same tokens and
preserve text after network failures. No animation or icon conveys status alone.
# Holding credit pattern — 2026-11-07

Booking credit notices and balances follow `context/ui-registry.md` → **Holding credit and rental balance**. Reuse the existing semantic booking cards, `min-h-11` controls, muted financial labels and integer-kobo formatting. Gross total, applied hold and additional payment must remain distinct; allocation does not imply provider settlement.

# Build configuration checkpoint — 2026-11-07

Prisma generation now precedes the production build. No visual patterns changed.

### Squat-Mates preferences, contact and review controls — 2026-11-09

Use the existing `bg-surface-card`, `border-border-subtle`, `rounded-2xl`, `p-5`
cards, `space-y-5` form rhythm and semantic primary/secondary/muted text. Fields
and buttons have `min-h-11`, `rounded-xl` and visible accent focus outlines.
The opt-in checkbox starts unchecked for a new profile. Explain overlap with
plain reasons beside the score; never imply safety, credit or payment ability.
Messages preserve whitespace and wrap long content. Own messages use
`bg-accent-muted`; another member uses the standard card surface. Read timestamps
never imply presence. Unknown sends retain one message identifier and draft;
an explicit readback precedes same-message retry. Failed current authorization
clears cached messages and profile content. A separate private report form can
remain without exposing hidden evidence. Staff decisions require written notes
and clearly distinguish matching restriction from a public safety notice.

# Commercial purchases and sponsored placements — 2026-11-09

Canonical detail: context/ui-registry.md entry of the same name. Reuse existing
rounded-2xl surface/border cards, rounded-xl fields, semantic text and minimum44px
actions. Display exact NGN, fixed terms and billing environment; keep approval,
verified payment and delivery eligibility distinct. Preserve uncertain commands
and offer readback. Label sponsored cards separately from organic results.
Native web handoffs reuse secondary Button plus muted help stating separate
browser sign-in; never add session credentials to navigation URLs.


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