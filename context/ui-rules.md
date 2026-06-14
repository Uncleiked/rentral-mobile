## UI Rules

Concise rules for building the Rentral UI. Design assets and the @theme token definitions in globals.css act as the absolute source of truth for visual decisions. These rules cover the most important patterns and constraints to keep the UI consistent, mobile-first, and immersive across our zero-trust, multi-asset marketplace without over-specifying every detail.

## Font

Always import Inter via next/font/google in the root layout. The application exclusively relies on Inter to maintain a modern, clean, and highly legible interface.

import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });


The --font-sans variable is already declared in the @theme directive in globals.css. Apply the font variable class to the <html> tag in the root layout. Never fallback to generic system fonts directly in components.

## Layout

The architecture is built for an immersive, mobile-first social discovery feed experience, gracefully expanding for desktop viewports.

App Background Vault: bg-background-app (#0a0a0a). This serves as the absolute base layer behind video feeds and dashboards.

Discovery Feed Width: Max-width for feed cards is max-w-md (448px) with mx-auto to center them on desktop while bleeding perfectly on mobile.

Aspect Ratio (Media): Video walkthroughs use aspect-[9/16] (TikTok/Reels format).

Spacing: Rely on spacious, mobile-optimized padding to ensure high-fidelity touch targets. Gap between feed cards should be my-4.

Navigation: All pages use a top navbar only. No complex, screen-narrowing sidebars or persistent drawers.

## Navbar

Rentral features a clean, responsive top navigation bar designed for rapid viewport adjustments.

Navigation Items: Marketplace, My Bookings, My Assets, Dashboard, Profile.

Desktop Header Height: 64px, full viewport width.

Background: bg-background-app (#0a0a0a) with a subtle bottom border border-b border-border-subtle.

Active Item: color: var(--color-text-primary) (#ffffff), font-weight 600, 14px.

Inactive Item: color: var(--color-text-muted) (#a3a3a3), font-weight 500, 14px.

Interaction: No underlines. Active state relies on color brightness and font-weight shifts.

## Cards & Surfaces

Rentral utilizes two distinct surface treatments. Never use arbitrary colored card backgrounds; adhere strictly to the dark and glassmorphic palette.

## 1. Base Card Surface (Dashboards, Forms, Settings)
Used for static content that requires high legibility.

background: var(--color-surface-card) /* #171717 */
border: 1px solid var(--color-border-subtle) /* #262626 */
border-radius: var(--radius-2xl) /* 32px */
padding: 24px


## 2. Contextual Glassmorphic Panel (Video Overlays)
Used for the floating information layer over active Mux video streams.

background: var(--color-glass-dark) /* rgba(0, 0, 0, 0.4) */
backdrop-filter: blur(16px) /* backdrop-blur-lg */
border: 1px solid var(--color-glass-border-light)
border-radius: var(--radius-xl) /* 24px */
padding: 20px /* px-5 py-5 */
box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) /* shadow-2xl */


## Typography Hierarchy

Maintain strict adherence to these typographic levels to ensure a clean visual hierarchy.

### Hero / Listing Title (Over Media)

font-size: 18px /* text-lg */
font-weight: 700 /* font-bold */
color: var(--color-text-primary) /* #ffffff */
letter-spacing: 0.025em /* tracking-wide */
/* Must include line-clamp-1 to prevent video occlusion */


## Pricing Metric (High-Value Data)

font-size: 20px /* text-xl */
font-weight: 800 /* font-extrabold */
color: var(--color-accent-hover) /* #34d399 */


## Pricing Denomination (e.g., / DAY, / YEAR)

font-size: 10px /* text-[10px] */
font-weight: 500 /* font-medium */
color: var(--color-text-muted) /* #a3a3a3 */
text-transform: uppercase
letter-spacing: 0.05em /* tracking-wider */


## Standard Body Text

font-size: 14px /* text-sm */
font-weight: 500 /* font-medium */
color: var(--color-text-secondary) /* #d4d4d4 */
line-height: 1.625 /* leading-relaxed */


## Badges & Status Indicators

Rentral utilizes heavily rounded badges for structural data and trust metrics.

### Dynamic Structural Badges (Bedrooms, Engine, Vessel Type)

background: var(--color-glass-light)
color: var(--color-text-primary)
border: 1px solid var(--color-glass-border-light)
border-radius: var(--radius-full) /* 9999px */
padding: 4px 12px /* px-3 py-1 */
font-size: 12px /* text-xs */
font-weight: 500 /* font-medium */


## Trust Score Badge

background: var(--color-accent-muted) /* rgba(16, 185, 129, 0.2) */
color: var(--color-accent-hover) /* #34d399 */
border: 1px solid var(--color-glass-border-success)
border-radius: var(--radius-full)
padding: 4px 12px /* px-3 py-1 */
font-size: 12px /* text-xs */
font-weight: 600 /* font-semibold */


## Global Trust Warning Banner (Flagged Users)

background: var(--color-glass-warning) /* rgba(220, 38, 38, 0.9) */
backdrop-filter: blur(12px) /* backdrop-blur-md */
border: 1px solid var(--color-trust-flagged) /* #ef4444 */
border-radius: var(--radius-lg) /* 16px */
color: var(--color-text-primary)
padding: 12px 16px /* px-4 py-3 */


## Buttons

Hardware acceleration is critical. Always couple active:scale-95 or active:scale-98 with transition-all to ensure the GPU handles the frame rendering for a flawless 60fps mobile feel.

### Primary Operational Button (e.g., "Book Physical Verification")

background: var(--color-accent-primary) /* #10b981 */
color: var(--color-text-inverse) /* #0a0a0a */
border-radius: var(--radius-lg) /* 16px */
padding: 12px 16px /* py-3 px-4 */
font-size: 12px /* text-xs */
font-weight: 700 /* font-bold */
text-transform: uppercase
letter-spacing: 0.025em /* tracking-wide */
/* Interactions: hover:bg-accent-hover active:scale-98 shadow-lg transition-all */


## Social Interaction Buttons (Floating Actions: Share, Message, Bookmark)

background: var(--color-glass-light)
backdrop-filter: blur(12px) /* backdrop-blur-md */
border: 1px solid var(--color-glass-border-medium)
border-radius: var(--radius-full)
padding: 12px /* p-3 */
/* Interactions: hover:bg-glass-light-hover active:scale-95 transition-all */


## Form Inputs

Designed to recede into the dark interface while maintaining high accessibility and clear focus states.

background: var(--color-surface-card) /* #171717 */
border: 1px solid var(--color-border-subtle) /* #262626 */
border-radius: var(--radius-md) /* 12px */
padding: 12px 16px /* py-3 px-4 */
font-size: 14px /* text-sm */
color: var(--color-text-primary) /* #ffffff */
placeholder-color: var(--color-text-muted) /* #a3a3a3 */
focus: ring-1 ring-accent-primary border-accent-primary outline-none transition-all


## Discovery Feed & Lists

Rather than traditional tabular data, Rentral relies on vertical media streams and list items for active negotiations and assets.

Feed Orientation: Vertical scroll, one active listing per viewport snap.

List Items (Inbox/Bookings): Use bg-surface-card with border-b border-border-subtle separating items.

Hover State for Lists: hover:bg-[#262626] (subtle lighten).

Separators: Use border-border-subtle (#262626) exclusively. Avoid alternating row colors.

## Trust Score & Status Indicators

The proprietary Rentral Trust Score (out of 5.00) is visually reinforced via semantic colors, driving user behavior.

Score 4.50 - 5.00 (Excellent): Emerald (--color-accent-hover).

Score 3.50 - 4.49 (Fair): Neutral (--color-text-primary).

Score Below 3.50 (Warning): Red (--color-trust-flagged). Must trigger the Global Trust Warning Banner on their listings.

Active Status Dot: Use a small 6px by 6px circular element with bg-trust-verified (#22c55e) next to verified addresses or online status.

## Empty States

Every section that can be empty (e.g., active bookings, inbox, saved listings) must have a clean, dark-themed empty state.

Container: Centered flex column, ample padding (py-12).

Icon: Glassmorphic container (bg-glass-light with p-4 rounded-full) holding a text-text-muted Lucide icon.

Text: Short descriptive text in color: var(--color-text-muted).

Action: A primary or secondary CTA button routing the user to the discovery feed or listing creation wizard.

## Tailwind v4 Note

This project strictly utilizes Tailwind CSS v4.0. Design tokens are defined using the new @theme directive inside app/globals.css.

You do not need a tailwind.config.ts file. Tailwind v4 automatically generates utility classes from the @theme variables (e.g., --color-accent-primary automatically creates bg-accent-primary, text-accent-primary, border-accent-primary).

## Do Nots

Never use arbitrary hex codes: Do not hardcode colors (e.g., text-[#10b981]) in React components. Always map strictly to the semantic @theme tokens to maintain dynamic theming.

Never use generic Tailwind colors for financial actions: Only use Emerald (--color-accent-primary) for successful verifications, pricing, trust scores, and checkout triggers. Avoid Tailwind's default blue or green for monetary UI.

Never stack Tailwind opacity classes manually for glassmorphism: Prefer utilizing the pre-defined RGBA variables in CSS (e.g., avoid bg-black/40 if bg-glass-dark is semantically available).

Never show raw backend errors: Map all PostGIS or Supabase errors to UX-friendly messages. (e.g., "Coordinate mismatch" instead of "ST_Distance null vector").

Never use inline styles: All styling must be executed via Tailwind CSS utility classes.

Never use position: fixed for standard elements: Outside of specific, z-indexed floating action bars or mobile navs, maintain standard document flow.

Never expose raw hardware coordinates in the UI: The frontend must only display the calculated distance_meters offset or obfuscated text_address until escrow is cleared.