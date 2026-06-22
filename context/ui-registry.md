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
