# UX Polish — Dashboard & Navigation Consistency Implementation Plan

## Overview

Polish the authenticated UI of 10xCards so the product feels guided rather than like a flat list of links. Two pieces: (1) redesign `dashboard.astro` into a responsive card grid where each option carries an icon + a short description and the north-star action ("Generuj fiszki") is visually primary; (2) make the three feature screens (generate / flashcards / review) share one consistent top-navigation shape via a small extracted component. Pure `.astro` + Tailwind — no data, API, migration, or React-island changes.

## Current State Analysis

- **`src/pages/dashboard.astro`** — a centered glass card with the title "Dashboard", a welcome line, then a flat vertical stack of three link-buttons (`Generuj fiszki` purple, `Moja kolekcja` blue, `Sesja powtórek` emerald) plus a Sign out form. No option has any description, and nothing distinguishes the primary action from the others.
- **Navigation is inconsistent across the four authenticated screens:**
  - `dashboard.astro` — no top nav; inline sign-out; no peer links.
  - `generate.astro` (`src/pages/generate.astro:8-15`) — only a right-aligned "Moja kolekcja" link; **no "← Dashboard" back link** and no link to review.
  - `flashcards.astro` (`src/pages/flashcards.astro:33-54`) — "← Dashboard" left + ("Sesja powtórek", "Generuj fiszki") right.
  - `review.astro` (`src/pages/review.astro:33-46`) — "← Dashboard" left + only "Moja kolekcja" right (missing "Generuj fiszki").
- **`src/components/Topbar.astro`** exists (renders email + Dashboard + Sign out) but is wired into **no page** — out of scope for this slice per planning decision (left untouched).
- **Design language** is established: glassmorphism (`bg-white/10 backdrop-blur-xl`, `border-white/10`), `bg-cosmic` background, gradient-text headings (`bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-transparent`), and a per-feature color code: **purple = generate, blue = collection, emerald = review** — consistent everywhere.
- **Icons**: `lucide-react` ^1.14.0 is installed and used throughout `.tsx` components (e.g. `Sparkles` in `FlashcardGenerator.tsx:2`). It is a React library; the dashboard is static `.astro`.
- **Empty/completion states already exist** in `FlashcardCollection.tsx:141-144` ("Brak kart…") and `ReviewSession.tsx:47` / `:61` — not part of this slice.
- **No test runner** is configured (per CLAUDE.md); verification is `npm run lint` + `npm run build` + manual.

### Key Discoveries:

- The per-feature color code (purple/blue/emerald) is a reusable convention — the dashboard cards and the peer-nav links should follow it.
- `lucide-react` is React-only; rendering its icons on a static `.astro` page without a React island means **inlining the SVG markup** (CLAUDE.md: use `.astro` unless state/handlers/refs/browser APIs are needed — static icon links need none).
- The feature-screen headers in `flashcards.astro` and `review.astro` already encode the target pattern (← Dashboard left, peer links right); the work is to normalize all three to it.

## Desired End State

- A logged-in user landing on `/dashboard` sees a card grid: three cards, each with an icon, a bold title, and a one-line Polish description of what it does. "Generuj fiszki" is visually the primary action (larger / higher-contrast / first). Sign out remains available. The page is fully server-rendered with no client JS.
- All three feature screens show an identical top-nav shape: "← Dashboard" on the left and links to the **other two** screens on the right, each in its feature color. `generate.astro` gains the back link + the review link; `review.astro` gains the "Generuj fiszki" link.
- Verify: `/dashboard` shows a description under each option and a clearly dominant "Generuj fiszki" action; from any of the three feature screens the user can reach the dashboard and both sibling screens; `npm run build` and `npm run lint` pass; the existing generate/collection/review flows still work unchanged.

## What We're NOT Doing

- No DB query, due-cards count, or any data/API/migration work — the dashboard stays fully static.
- Not adopting, wiring, or deleting `Topbar.astro` (left exactly as-is).
- Not relocating or duplicating Sign out onto the feature screens.
- Not installing shadcn `Card` or adding any React island — cards are hand-rolled glass divs.
- Not touching empty-state / completion-state copy (already implemented).
- No changes to auth pages, the generate/collection/review React components, or `Layout.astro`.

## Implementation Approach

Reuse the established glass aesthetic and the purple/blue/emerald color code directly in Astro markup. Phase 1 rewrites the dashboard's option block as a responsive grid of anchor-cards with inline lucide SVGs and Polish descriptions, emphasizing the generate action. Phase 2 extracts the repeated feature-screen header into a single `ScreenNav.astro` component parameterized by the current screen, then swaps it into all three pages so the nav has one source of truth and can't drift again. Each phase is independently shippable; Phase 1 alone satisfies the slice's acceptance criterion.

## Critical Implementation Details

- **Icons on a static page** — render lucide glyphs as **inline `<svg>`** copied from the lucide set (suggested: `Sparkles` for generate to match `FlashcardGenerator.tsx`, `Library` for collection, `RotateCw`/`Repeat` for review). Do not import `lucide-react` into the `.astro` file and do not add a `client:*` island; the cards are plain links and must ship zero JS.
- **Primary-action emphasis** — "Generuj fiszki" should read as dominant via layout, not a new color: e.g. span the full width on top (or a larger cell) within the grid while collection/review sit as a secondary pair below. Keep its existing purple identity.

## Phase 1: Dashboard redesign

### Overview

Replace the flat link stack in `dashboard.astro` with a responsive card grid: each option = inline icon + title + short Polish description, with "Generuj fiszki" emphasized as the primary action. Sign out retained. Fully static.

### Changes Required:

#### 1. Dashboard option grid

**File**: `src/pages/dashboard.astro`

**Intent**: Turn the three `<a>` link-buttons into a responsive grid of anchor "cards", each carrying an inline lucide SVG icon, the option title, and a one-line Polish description explaining what it does. Emphasize "Generuj fiszki" as the primary action (dominant cell/size, first in reading order) so the layout funnels toward the north-star flow. Preserve the welcome line, the gradient heading, the glass container, and the Sign out form.

**Contract**: Each card is an `<a href>` pointing to its existing route (`/generate`, `/flashcards`, `/review`) styled with the established glass pattern (`bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl`) and its feature color accent (purple/blue/emerald). Suggested Polish descriptions (final copy at implementer's discretion, keep to a few words): Generuj fiszki — "Wklej tekst, a AI utworzy fiszki"; Moja kolekcja — "Przeglądaj, edytuj i usuwaj swoje karty"; Sesja powtórek — "Powtarzaj karty metodą spaced repetition". Grid is single-column on mobile and multi-column from `sm`/`md` up; the generate card spans the full width (or a larger cell) above the other two. Icons are inline `<svg>` (no `lucide-react` import, no `client:*`). Routes, the `user?.email` welcome line, and the `POST /api/auth/signout` form are unchanged.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- `/dashboard` shows three option cards, each with an icon and a one-line description.
- "Generuj fiszki" is visibly the primary/dominant action.
- Layout is single-column on a narrow viewport and multi-column on desktop (no overflow or clipping).
- Sign out still works; clicking each card navigates to the correct route.
- View source / network shows no added client-side JS for the dashboard (icons are inline SVG).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to Phase 2.

---

## Phase 2: Navigation consistency

### Overview

Extract the feature-screen header into a single `ScreenNav.astro` component (← Dashboard + links to the two sibling screens, each in its feature color) and apply it to all three feature pages so navigation is uniform and has one source of truth.

### Changes Required:

#### 1. Shared screen-nav component

**File**: `src/components/ScreenNav.astro` (new)

**Intent**: Provide one reusable header that renders a "← Dashboard" link on the left and links to the **other two** feature screens on the right, colored per the established convention, so the three pages can't drift apart again.

**Contract**: Accepts a prop `current: "generate" | "flashcards" | "review"`. Renders the "← Dashboard" link (white/neutral glass style, matching the current `flashcards.astro`/`review.astro` back link) plus exactly the two non-current screens as right-aligned links using their feature colors (generate=purple, flashcards=blue, review=emerald) and the existing pill button styling. Wrapper matches the current header container (`mx-auto … w-full max-w-2xl … px-4`, flex with `justify-between`).

#### 2. Apply to generate screen

**File**: `src/pages/generate.astro`

**Intent**: Replace the ad-hoc single-link header with `ScreenNav` so this screen gains the missing "← Dashboard" back link and a link to review.

**Contract**: Import and render `<ScreenNav current="generate" />` in place of the existing `<div class="… justify-end …">` block (`generate.astro:8-15`). `FlashcardGenerator` and the page layout are unchanged.

#### 3. Apply to flashcards screen

**File**: `src/pages/flashcards.astro`

**Intent**: Swap the hand-written header for `ScreenNav` to share the single source of truth (behavior is already equivalent here).

**Contract**: Replace the header `<div>` (`flashcards.astro:33-54`) with `<ScreenNav current="flashcards" />`. The `FlashcardCollection` island and its props (`initialCards`) and the SSR query are unchanged.

#### 4. Apply to review screen

**File**: `src/pages/review.astro`

**Intent**: Swap the header for `ScreenNav`, which adds the currently-missing "Generuj fiszki" peer link.

**Contract**: Replace the header `<div>` (`review.astro:33-46`) with `<ScreenNav current="review" />`. The `ReviewSession` island, its `initialCards` prop, and the SSR query are unchanged.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- From `/generate` the user can reach `/dashboard` (← Dashboard), `/flashcards`, and `/review`.
- From `/flashcards` the user can reach `/dashboard`, `/generate`, and `/review`.
- From `/review` the user can reach `/dashboard`, `/generate`, and `/flashcards`.
- All three headers look visually identical in structure; link colors follow purple/generate, blue/collection, emerald/review.
- The generate, collection, and review flows still function exactly as before (generate text, edit/delete a card, run a review).

**Implementation Note**: After completing this phase and all automated verification passes, pause for human confirmation of manual testing.

---

## Testing Strategy

No automated test runner is configured (CLAUDE.md). Verification relies on lint, build, and manual checks.

### Manual Testing Steps:

1. Log in and open `/dashboard`; confirm three described, icon-bearing cards with "Generuj fiszki" dominant; resize the window to confirm responsive grid.
2. Click each dashboard card → lands on the right screen. Click Sign out → signed out.
3. On each of `/generate`, `/flashcards`, `/review`, confirm the header offers ← Dashboard + links to the other two screens, correctly colored.
4. Exercise each flow once (generate from text, edit/delete a card, complete a review card) to confirm no regression from the header swap.

## Performance Considerations

Dashboard remains fully static with inline SVGs — no added client JS and no extra network requests. `ScreenNav.astro` is server-rendered; no runtime cost beyond existing markup.

## Migration Notes

None — no data or schema changes.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-05, lines 155-168)
- Current dashboard: `src/pages/dashboard.astro`
- Header pattern to normalize: `src/pages/flashcards.astro:33-54`, `src/pages/review.astro:33-46`
- Icon precedent: `src/components/flashcards/FlashcardGenerator.tsx:2` (`Sparkles`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dashboard redesign

#### Automated

- [x] 1.1 Lint passes: `npm run lint`
- [x] 1.2 Production build succeeds: `npm run build`

#### Manual

- [x] 1.3 `/dashboard` shows three option cards, each with an icon and a one-line description
- [x] 1.4 "Generuj fiszki" is visibly the primary/dominant action
- [x] 1.5 Layout is single-column on narrow viewport and multi-column on desktop
- [x] 1.6 Sign out works; each card navigates to the correct route
- [x] 1.7 No added client-side JS for the dashboard (icons are inline SVG)

### Phase 2: Navigation consistency

#### Automated

- [ ] 2.1 Lint passes: `npm run lint`
- [ ] 2.2 Production build succeeds: `npm run build`

#### Manual

- [ ] 2.3 From `/generate`, can reach `/dashboard`, `/flashcards`, `/review`
- [ ] 2.4 From `/flashcards`, can reach `/dashboard`, `/generate`, `/review`
- [ ] 2.5 From `/review`, can reach `/dashboard`, `/generate`, `/flashcards`
- [ ] 2.6 All three headers are structurally identical with correct feature colors
- [ ] 2.7 Generate, collection, and review flows still function unchanged
