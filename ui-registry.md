# Rentral UI Registry

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
This pattern is used for the main landing page hero section and any other page (like auth pages) that require the brand's premium immersive green background with the illustrative graphic lines.

### Glass Button Primary
File: `app/page.tsx`
Last updated: 2026-06-27

| Property         | Class           |
| ---------------- | --------------- |
| Background       | `bg-accent-primary` / `bg-accent-warm` |
| Text             | `text-text-inverse`, `text-xs font-bold uppercase tracking-wider` |
| Interactive      | `glass-btn hover:bg-accent-hover active:scale-95 transition-all shadow-lg` |

### Glass Button Secondary
File: `app/page.tsx`
Last updated: 2026-06-27

| Property         | Class           |
| ---------------- | --------------- |
| Background       | `bg-glass-light border border-glass-border-medium backdrop-blur-md` |
| Text             | `text-text-primary`, `text-xs font-bold uppercase tracking-wider` |
| Interactive      | `glass-btn hover:bg-glass-light-hover active:scale-95 transition-all` |

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
