# Rentral homepage implementation

Updated: 2026-11-07 (Africa/Lagos).

## Scope and decisions

- The existing Next.js modular monolith and Supabase/Didit authentication remain in place. The homepage is a server component; only animation, mobile navigation and category selection need client components.
- Visual direction combines a photographic, editorial landing page with an Airbnb-style category/location search. Existing dark, emerald and glass semantic tokens are reused. All new CSS is scoped under `.rentral-home`.
- Typography now follows the documented Inter foundation. Metadata describes the implemented rental experience without absolute fraud-prevention or escrow claims.
- One universal account serves renters and hosts. Listing creation remains identity gated. Per-post fees are disclosed; the homepage never fabricates successful transactions, verified inventory, testimonials or balances.
- Header links include the public Insights teaser. Footer links expose Media Vault, the future Squat-Mates feature, help and legal pages. Root implementation owns those destination routes.

## Components

- `app/page.tsx`: server-rendered hero, categories, trust explanations, host CTA, closing CTA.
- `components/home/HomeMotion.tsx`: GSAP/ScrollTrigger hero image expansion, heading entrance, scroll parallax and section reveals. `gsap.context` and `matchMedia` clean up animations and scroll triggers; reduced-motion users receive the static page.
- `HomeNavigation.tsx`: responsive navigation, accessible expanded state, Escape and outside-click dismissal.
- `HomeSearch.tsx`: native GET search to `/marketplace` with `category=house|car|boat` and `q`; labelled native radios preserve keyboard selection.
- `HomeCategoryCard.tsx`: linked illustrative category photography with an accessible title.
- `HomeFooter.tsx`: real navigation destinations and Lagos context.

## Assets

Local JPEGs in `public/home/` replace homepage hotlinks. Photography is illustrative, not a claim of inventory or a Lagos location. Source images are served by Unsplash under the Unsplash license:

- `hero-home.jpg`: https://images.unsplash.com/photo-1600607687920-4e2a09cf159d
- `category-home.jpg`: https://images.unsplash.com/photo-1600585154340-be6161a56a0c
- `category-car.jpg`: https://images.unsplash.com/photo-1503376780353-7e6692767b70
- `category-boat.jpg`: https://images.unsplash.com/photo-1567899378494-47b22a2ae96a
- License: https://unsplash.com/license

## Validation

Installed Next 16.2.7 docs for Server/Client Components, Image and font loading were read before implementation. The hero uses the current Image `preload` API and explicit responsive image sizes. Focused homepage ESLint passed. Twelve Playwright checks passed at 1440, 390, 320 and 768px against localhost:3001, verifying category/location form submission, menu Escape/focus, reduced motion, visible sections, no browser page errors and no horizontal overflow. The 320px and 1440px hero screenshots were visually inspected. Full-page static screenshots are under ignored `test-results/`. Root owns final cross-feature validation and progress tracking; provider-backed journeys remain separate acceptance work.
