# UX Polish — Dashboard & Navigation Consistency — Plan Brief

> Full plan: `context/changes/ux-polish/plan.md`

## What & Why

Make the authenticated UI feel guided instead of like a flat list of links. The dashboard becomes a card grid where each option has an icon and a short description and the north-star action ("Generuj fiszki") is visually primary; the three feature screens get a consistent top-nav. Supports adoption by pulling users toward the core flow faster. (Roadmap slice S-05, usability — no direct FR.)

## Starting Point

`dashboard.astro` is a centered glass card with a flat vertical stack of three undescribed link-buttons and a sign-out form. The feature screens (`generate`/`flashcards`/`review`) each hand-roll their own header, and they disagree: `generate` has no "← Dashboard" back link and `review` links to only one of its two siblings.

## Desired End State

`/dashboard` shows three described, icon-bearing cards with "Generuj fiszki" dominant, fully server-rendered with zero client JS. All three feature screens share one header shape — "← Dashboard" on the left, links to the other two screens (in their feature colors) on the right.

## Key Decisions Made

| Decision                  | Choice                              | Why (1 sentence)                                                              | Source |
| ------------------------- | ----------------------------------- | ----------------------------------------------------------------------------- | ------ |
| Dashboard layout          | Card grid with descriptions         | Satisfies the acceptance criterion and reads as "choose an action".           | Plan   |
| Primary action            | Emphasize "Generuj fiszki"          | Funnels users into the north-star generation flow first.                      | Plan   |
| Icons                     | lucide as inline SVG                | Adds scannability with zero JS, keeping the page static `.astro`.             | Plan   |
| Extra scope (closed list) | Nav consistency only                | The one real inconsistency found; everything else deferred to cap scope.      | Plan   |
| Dashboard data            | Stay fully static                   | Honors the "no data/API changes" guardrail; no new failure modes.             | Plan   |
| Card implementation       | Hand-rolled glass divs              | Matches the existing aesthetic, no new dep, avoids a React island.            | Plan   |
| Nav implementation        | Extract shared `ScreenNav.astro`    | Single source of truth so the three headers can't drift again.               | Plan   |

## Scope

**In scope:**
- Redesign `dashboard.astro` into an icon + description card grid with a primary "Generuj fiszki" action.
- Extract `ScreenNav.astro` and apply it to `generate`/`flashcards`/`review` for a uniform header.

**Out of scope:**
- Any DB/API/migration work or a due-cards count (dashboard stays static).
- Adopting/deleting the unused `Topbar.astro`; relocating sign-out.
- shadcn `Card`, React islands, empty-state copy (already exists), auth pages.

## Architecture / Approach

Pure `.astro` + Tailwind, reusing the established glass styling and the purple/blue/emerald per-feature color code. Phase 1 rewrites the dashboard option block as a responsive anchor-card grid with inline lucide SVGs. Phase 2 lifts the duplicated feature-screen header into one `ScreenNav.astro` (prop: `current`) and swaps it into all three pages. No data flow changes; the existing React islands and SSR queries on the feature pages are untouched.

## Phases at a Glance

| Phase                    | What it delivers                                              | Key risk                                            |
| ------------------------ | ------------------------------------------------------------ | --------------------------------------------------- |
| 1. Dashboard redesign    | Card grid with icon + description, "Generuj fiszki" primary  | Scope creep beyond polish; responsive grid edge cases |
| 2. Navigation consistency| Shared `ScreenNav.astro` applied to all three feature screens| Header swap regressing an existing flow             |

**Prerequisites:** S-01/S-02/S-03 done (all the described screens exist) — satisfied.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- "Polish" slices invite scope creep — the closed list above is the guardrail; only the dashboard redesign + nav consistency ship.
- Assumes the per-feature color code stays purple/blue/emerald (current convention).

## Success Criteria (Summary)

- Each dashboard option shows a one-line description and "Generuj fiszki" is clearly the primary action.
- From any feature screen the user can reach the dashboard and both sibling screens.
- `npm run build` and `npm run lint` pass; existing generate/collection/review flows are unchanged.
