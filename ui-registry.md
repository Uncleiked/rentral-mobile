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
