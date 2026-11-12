# Website UI consistency and responsive review

Date: 2026-11-12. Project: RentralMobile. Scope: Next.js website.

## Request and approach

Make the existing platform visually uniform and responsive, starting from the
organization registration screenshot. Preserve the dark/emerald Rentral identity,
existing product wording, authentication, organization review, authorization and
request recovery. Fix shared causes before normalizing individual workspaces.

1. Audit the global theme and existing component patterns.
2. Unify palette aliases, corner sizes, typography and focus behavior.
3. Standardize account/organization entry and shared navigation.
4. Correct workspace cards, fields, actions, dialogs and long-data layouts.
5. Verify with synthetic presentation fixtures and the actual public homepage.
6. Record the resulting patterns in ui-registry.md and ui-rules.md.

## Root cause and resulting changes

A later shadcn light :root palette overrode Rentral's dark body background/text.
Dark cards inherited black text while explicitly white headings appeared on a
white page. It also replaced established radius tokens and introduced a
self-referencing font variable. These conflicting definitions are removed:
generic component-library aliases now reference the canonical --rentral palette;
brand radii stay8/12/16/24/32px, and next/font defines --font-rentral used by the
--font-sans token. The root declares the existing dark appearance explicitly.

AccountPage and account-styles provide one branded entry/recovery/admission shell.
Organization fields have clear labels and document groups, stack below640px and
retain the existing upload/review/recovery protocol. Sign-in, signup, recovery,
confirmation and Google completion use the same card/field/action patterns.

Marketplace navigation uses a compact menu below1280px; all destinations remain
reachable. Escape restores focus, and safe-area bottom spacing matches navigation.
Feed metadata and action rows wrap; save/share feedback stays inside its card.
Filters stack on phones with an independently scrollable bounded panel.

Workspace forms/cards/actions across listing, booking, account/profile, privacy,
matching, messaging, notifications, staff, financial, commercial and lease flows
share semantic colors, bounded widths and 44px controls. Long identifiers/reasons
wrap. Metadata columns begin at640px. MarketplaceShell owns outer gutters.
Phone messaging hides the inbox when a listing composer/thread is selected.
Profile editing has a named dialog, internal scrolling, focus containment, Escape
closing and focus restoration.

## Verification evidence

- Full isolated Vitest suite: 2,002 passed;107 skipped (opt-in/integration fixtures).
- Production build including TypeScript: passed,108static pages.
- Web UI ESLint: passed after removing an unused legacy theme hook.
- Admin synthetic browser suite:38/40 passed on initial run. Two desktop cases
  timed out during load/reload and both passed when rerun separately with a
  120second fixture timeout. All40 distinct cases verified across four projects.
- Actual Next homepage:12/12 browser cases passed across desktop, phone,320px
  and tablet, including search submission and reduced motion.
- Presentation audit:60 combinations,12 real component views at320,390,768,
  1024 and1440px. Checked page overflow, dark body/text contrast, mobile field
  font sizing and browser errors; all passed after fixture adapters were corrected.
- Compact navigation and profile modal keyboard/focus/320px fit checks passed.
- Organization phone/desktop and profile-dialog screenshots inspected manually.
- Final320px filter/save/share feedback checks passed using a synthetic clipboard;
  the latest production rebuild and scoped lint passed after final adjustments.

## Isolation and practical limits

The new scripts/ui-consistency-preview.mjs is a loopback presentation harness.
It does not load .env or database/provider settings. Server actions are replaced
with local synthetic failures; browser requests receive synthetic records. These
checks prove rendering and presentation interactions, not live provider settlement
or real-user authentication. Its empty client environment mimics browser-only
configuration without importing private settings. Preview artifacts live outside
the test runner's automatic cleanup directory; each Vite fixture has its own cache.

Docker is unavailable in this session, so no actual authenticated database-backed
browser fixture was run. No hosted records, credentials, provider settings,
dependencies, package locks, native screens or deployment were changed. The web
changes need committing/pushing/deploying before they appear on rentral.vercel.app.

## Repeat the local presentation audit

Start npm run dev for actual Next pages. For independent presentation checks:

1. Run node scripts/ui-consistency-preview.mjs in a terminal. It generates the
   ignored output/playwright/responsive-audit.js and starts loopback4186.
2. Use the Playwright CLI with a named session to open http://127.0.0.1:4186.
3. Run playwright-cli -s=rentral-ui run-code --filename output/playwright/responsive-audit.js.
4. Review generated screenshots under output/playwright. Those files and browser
   caches are deliberately ignored; the generator source stays alongside UI code in scripts/.

## Final review

Plan alignment:PASS. Shared visual consistency and responsive work completed.
System integrity:PASS. Semantic palette, architecture boundaries and current
permission/data rules retained; no backend/dependency changes.
UI verification:PASS for the reviewed views and checks above. No blocking UI
issue remains from this pass. Live production visual acceptance follows deployment;
no full native-device or real-provider acceptance is implied.
