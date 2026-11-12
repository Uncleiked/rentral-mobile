## UI Tokens: Rentral Marketplace

Current website authority (2026-11-12): app/globals.css owns one --rentral palette. Component-library aliases reference it; established radius tokens remain unchanged. The local font loader defines --font-rentral, consumed by --font-sans. Historical token examples below do not override current CSS.

Design tokens and architectural styling guidelines for Rentral. All colors, typography, spacing, glassmorphic parameters, and component values are extracted from the core Rentral design architecture. Use these exact semantic values throughout the codebase to ensure consistency across the immersive, mobile-first, zero-trust marketplace.

## How to Use

This project utilizes Tailwind CSS v4.0 alongside Shadcn UI. All custom design tokens are defined using the new @theme directive inside app/globals.css. You do not need a tailwind.config.ts file for these colors or tokens.

## Tailwind v4 automatically generates utility classes from the @theme variables:

--color-accent-primary → bg-accent-primary, text-accent-primary

--color-glass-dark → bg-glass-dark

--color-trust-verified → text-trust-verified

// Correct — uses semantic generated utility classes
className="bg-glass-dark backdrop-blur-lg border border-glass-border-light text-text-primary"

// Also correct — applying standard Tailwind utilities mapped to our brand guidelines
className="bg-background-app text-text-primary rounded-2xl"

// Never — hardcoded arbitrary hex values in the JSX
className="bg-[#0A0A0A] text-[#10B981]"

// Never — using non-semantic generic colors for primary actions
className="bg-blue-500 text-gray-100"


## globals.css — Complete Token Definition

@import "tailwindcss";

@theme {
  /* Font Families */
  --font-sans: "Inter", system-ui, sans-serif;

  /* Base Backgrounds & Solid Surfaces */
  --color-background-app: #0a0a0a; /* neutral-950 */
  --color-surface-card: #171717; /* neutral-900 */
  
  /* Glassmorphic Surfaces (Core Rentral UI Identity) */
  --color-glass-dark: rgba(0, 0, 0, 0.4);
  --color-glass-light: rgba(255, 255, 255, 0.1);
  --color-glass-light-hover: rgba(255, 255, 255, 0.2);
  --color-glass-warning: rgba(220, 38, 38, 0.9); /* red-600/90 */

  /* Borders */
  --color-border-subtle: #262626; /* neutral-800 */
  --color-glass-border-light: rgba(255, 255, 255, 0.1);
  --color-glass-border-medium: rgba(255, 255, 255, 0.2);
  --color-glass-border-success: rgba(16, 185, 129, 0.2);
  --color-glass-border-warning: rgba(239, 68, 68, 0.5);

  /* Typography / Text */
  --color-text-primary: #ffffff;
  --color-text-secondary: #d4d4d4; /* neutral-300 */
  --color-text-muted: #a3a3a3; /* neutral-400 */
  --color-text-inverse: #0a0a0a; /* neutral-950 (for primary buttons) */

  /* Primary Accents — Emerald / Financial Trust */
  --color-accent-primary: #10b981; /* emerald-500 */
  --color-accent-hover: #34d399; /* emerald-400 */
  --color-accent-muted: rgba(16, 185, 129, 0.2);

  /* Trust & Status Indicators */
  --color-trust-verified: #22c55e; /* green-500 */
  --color-trust-flagged: #ef4444; /* red-500 */
  
  /* Border Radii (Highly rounded for mobile-first feel) */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-2xl: 32px;
  --radius-full: 9999px;
}


## Color Usage Guide

### Page & Layout Architecture

App Background Vault: bg-background-app (Used as the absolute base layer behind video feeds).

Base Card Surface: bg-surface-card (Used for static forms and settings panels).

Interactive Media Overlay: bg-glass-dark (Used for the contextual information panel floating over video streams).

Social Action Containers: bg-glass-light (Used for floating action buttons like Share, Message, Bookmark).

Standard Container Border: border-border-subtle

Glass Panel Border: border-glass-border-light

### Typography Colors

Headings, Titles, Primary Data: text-text-primary (White)

Subtitles, Addresses, Secondary Info: text-text-secondary (Neutral-300)

Metadata Labels, Measurement Units (e.g., / Year): text-text-muted (Neutral-400)

Primary Button Text: text-text-inverse (Neutral-950)

Price Tags / High-Value Data: text-accent-hover (Emerald-400)

### Primary Accent (Emerald / Financial Trust)

Rentral uses Emerald Green as the primary interactive and financial color to reinforce trust, monetary transactions, and successful verification handshakes.

Primary CTA Buttons: bg-accent-primary

CTA Button Hover State: hover:bg-accent-hover

Trust Score Badge Background: bg-accent-muted

Trust Score Badge Text: text-accent-hover

### Status & Trust Badges

Verified KYC / Spatial Match: Background bg-glass-light, Text text-text-primary, Border border-glass-border-light.

Platform Warning / Flagged User: Background bg-glass-warning, Text text-text-primary, Border border-trust-flagged.

Active Indicator (Dot): bg-trust-verified

### Typography Guidelines

Font Family: Inter (Optimize via next/font/google).

Hero / Listing Title: Size 18px (text-lg), Weight 700 (font-bold), Tracking wide, Line Clamp 1. Used for main asset titles over media.

Pricing Metric: Size 20px (text-xl), Weight 800 (font-extrabold), Color text-accent-hover. Used for total package or daily rent values.

Pricing Denomination (e.g., / DAY): Size 10px (text-[10px]), Weight 500 (font-medium), Transform uppercase, Tracking wider.

Section Heading: Size 16px (text-base), Weight 600 (font-semibold).

Standard Body Text: Size 14px (text-sm), Weight 500 (font-medium), Line Height relaxed.

Warning / Alert Text: Size 12px (text-xs), Weight 600 (font-semibold), Line Height relaxed.

Structural Badge Text: Size 12px (text-xs), Weight 500 (font-medium).

### Spacing & Layout Tokens

Rentral relies on spacious, mobile-optimized padding to ensure high-fidelity touch targets and immersive video bleed.

Tight Inline (Icons, dots): gap-1 (4px)

Badge Groupings: gap-2 (8px)

Form Field Spacing: gap-3 (12px)

Social Action Column Spacing: gap-6 (24px)

Glassmorphic Panel Padding: px-5 py-5

Primary CTA Button Padding: px-4 py-3

Structural Badge Padding: px-3 py-1

Warning Banner Padding: px-4 py-3

Viewport Feed Margins: my-4 mx-auto

## Component Tokens

## The Discovery Feed Card (Immersive Media Wrapper)

Aspect Ratio: aspect-[9/16] (TikTok/Reels format)

Maximum Width: max-w-md

Background: bg-background-app (Neutral 950)

Border Radius: border-radius-2xl (32px)

Shadow: shadow-2xl

Border: border border-border-subtle

Overflow: overflow-hidden

## Contextual Glassmorphic Panel (Lower Information Overlay)

Position: Absolute, anchored to bottom (bottom-4, left-4, right-4).

Background: bg-glass-dark (Black at 40% opacity).

Blur Filter: backdrop-blur-lg

Border Radius: border-radius-xl (24px)

Border: border border-glass-border-light

Shadow: shadow-2xl

Padding: px-5 py-5

## Social Interaction Buttons (Floating Actions)

Shape: rounded-full

Background: bg-glass-light

Hover State: hover:bg-glass-light-hover

Blur Filter: backdrop-blur-md

Padding: p-3

Border: border border-glass-border-medium

Active State: active:scale-95 (Hardware accelerated click feel)

### Primary Operational Button ("Book Physical Verification")

Background: bg-accent-primary

Text Color: text-text-inverse (Neutral 950)

Font Weight: font-bold

Text Transform: uppercase

Tracking: tracking-wide

Size: text-xs

Padding: py-3 px-4

Border Radius: rounded-xl (16px)

Interaction: transition-all active:scale-98 shadow-lg hover:bg-accent-hover

## Dynamic Structural Badges (Bedrooms, Engine, Vessel Type)

Background: bg-glass-light

Text Color: text-text-primary

Padding: px-3 py-1

Border Radius: rounded-full

Font: text-xs font-medium

Border: border border-glass-border-light

## Trust Score Badge

Background: bg-accent-muted (Emerald at 20% opacity)

Text Color: text-accent-hover (Emerald 400)

Border: border border-glass-border-success

Padding: px-3 py-1

Border Radius: rounded-full

Font: text-xs font-semibold

## Global Trust Warning Banner

Position: Absolute, anchored top (top-4, left-4, right-4), high Z-index (z-20).

Background: bg-glass-warning (Red 600 at 90% opacity).

Blur Filter: backdrop-blur-md

Padding: px-4 py-3

Border Radius: rounded-2xl (16px)

Border: border border-trust-flagged

Shadow: shadow-lg

## Technical Invariants & Guardrails

Zero Hardcoding: Never use arbitrary hex codes (e.g., text-[#10b981]) in the React components. Always map strictly to the @theme semantic tokens to maintain dynamic theming capabilities and code cleanliness.

Font Architecture: The application exclusively relies on Inter. Never fallback to generic system fonts directly in components; configure next/font/google at the root layout.

Financial Color Semantics: Only use Emerald (--color-accent-primary) for successful verifications, pricing, trust scores, and checkout triggers. Never use standard Tailwind blue or generic primary colors for monetary actions.

Opacity Handling: For glassmorphic components, prefer utilizing the RGBA variables defined in the CSS rather than stacking Tailwind opacity classes (e.g., avoid bg-black/40 if bg-glass-dark is available semantically).

Animation Hardware Acceleration: Always couple hover/active scale animations (e.g., active:scale-95) with transition-all to ensure the GPU handles the frame rendering, keeping the mobile interface at a flawless 60fps.
