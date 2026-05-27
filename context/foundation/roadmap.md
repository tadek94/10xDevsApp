---
project: 10xCards
version: 1
status: draft
created: 2026-05-27
updated: 2026-05-27
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: 10xCards

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Recertifying professionals already know spaced repetition works — their bottleneck is the manual work of turning dense source material into flashcards before they can start reviewing. 10xCards eliminates that bottleneck: the user pastes text, AI generates a deck, and the user is reviewing within minutes. The core hypothesis — the one assumption the MVP exists to test — is that LLM-generated card quality is now high enough that 75% of suggestions survive the user's review without deletion.

## North star

**S-01: AI generation + review flow** — the smallest end-to-end slice that puts a real user in front of AI-generated cards and captures their accept/discard decisions, directly measuring the 75% acceptance rate (PRD primary success criterion).

> The north star is the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as Prerequisites allow because everything else only matters if this works.

## At a glance

| ID   | Change ID          | Outcome (user can …)                                           | Prerequisites | PRD refs                                      | Status   |
| ---- | ------------------ | -------------------------------------------------------------- | ------------- | --------------------------------------------- | -------- |
| F-01 | flashcard-schema   | (foundation) Flashcard and review tables live in DB with RLS  | —             | NFR-02                                        | ready    |
| S-01 | ai-generation-flow | paste text, get AI cards, review each, save accepted           | F-01          | US-01, FR-001, FR-002, FR-003, FR-004, FR-005 | proposed |
| S-02 | deck-management    | view collection, edit any card, delete with confirmation       | F-01, S-01    | FR-006, FR-007, FR-008                        | proposed |
| S-03 | srs-review-session | start a review session; app shows due cards and schedules next | F-01, S-01    | FR-009, FR-010                                | blocked  |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below.

| Stream | Theme                | Chain                     | Note                                                          |
| ------ | -------------------- | ------------------------- | ------------------------------------------------------------- |
| A      | Core generation path | `F-01` → `S-01` → `S-02` | Must-have path for `speed`; north star S-01 as early as F-01 allows. |
| B      | Review loop          | `S-03`                    | Blocked on SRS library decision; joins Stream A after S-01.  |

## Baseline

What's already in place as of 2026-05-27 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** PARTIAL — Astro + React configured; auth pages (sign-in, sign-up, confirm-email, dashboard) present; only Button component from shadcn wired; no flashcard or review pages.
- **Backend / API:** PARTIAL — Auth API routes (signin, signup, signout) at `src/pages/api/auth/`; no domain routes for generation, flashcard CRUD, or SRS.
- **Data:** PARTIAL — Supabase configured with auth-related tables (user login); no flashcard or review schema.
- **Auth:** PRESENT — Full Supabase SSR auth wired: client (`src/lib/supabase.ts`), middleware (`src/middleware.ts`), auth pages and API endpoints. FR-001 and FR-002 satisfied by existing implementation.
- **Deploy / infra:** PARTIAL — Cloudflare Workers (`wrangler.jsonc`) + GitHub Actions CI/deploy (`.github/workflows/`) wired; no Docker.
- **Observability:** PARTIAL — Cloudflare platform observability enabled in `wrangler.jsonc`; no app-level logging or error tracking.

## Foundations

### F-01: Flashcard data schema

- **Outcome:** (foundation) Flashcard and review-scheduling tables exist in Supabase with RLS policies enforcing per-user isolation; user-owned data model ready for all flashcard operations.
- **Change ID:** flashcard-schema
- **PRD refs:** NFR-02 (no cross-account data leakage — RLS directly satisfies this)
- **Unlocks:** S-01 (save generated cards to DB), S-02 (view/edit/delete saved cards), S-03 (store review history and scheduling data)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** SRS library choice affects the exact columns needed in the review-scheduling table (e.g., FSRS parameters vs. SM-2 ease factor). Owner: user. Block: no — a minimal schema can be designed now and extended via migration once the library is chosen.
- **Risk:** All three slices depend on this schema; RLS misconfiguration is the highest-risk outcome (violates NFR-02). Auth scaffold and user tables are already present in Supabase, which is the prerequisite for user-scoped RLS policies.
- **Status:** ready

## Slices

### S-01: AI generation + review flow

- **Outcome:** User can sign in, paste source text (≥ 50 words), see AI-generated flashcard suggestions (front + back), review each suggestion (accept, edit, or discard), see visible progress feedback during generation, and save accepted cards to their collection — with accepted cards persisting after page reload.
- **Change ID:** ai-generation-flow
- **PRD refs:** US-01, FR-001, FR-002, FR-003, FR-004, FR-005
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - AI provider (OpenRouter) API key must be set in `.dev.vars` and Cloudflare secrets before generation can be tested end-to-end. Owner: user. Block: no (operational task, not a design decision).
  - Source text retention: does submitted text need to be discarded after generation completes? (PRD §Open Questions §1 — non-blocking per PRD, but must be an explicit decision before reaching professional users at scale.) Owner: user. Block: no.
- **Risk:** AI prompt quality is the highest-risk assumption in the product (FR-003); a poorly designed prompt produces low-quality cards and surfaces immediately against the 75% acceptance metric. Sequenced first precisely to capture this signal early.
- **Status:** proposed

### S-02: Deck management

- **Outcome:** User can view their full flashcard collection in a flat list, edit any card's front and back (with changes persisting after page reload), and delete a card with a confirmation step.
- **Change ID:** deck-management
- **PRD refs:** FR-006, FR-007, FR-008
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-03 (once S-01 is done, deck management and the SRS session can be built in parallel)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Edit persistence is a PRD guardrail; silent data loss here is explicitly a product failure. Sequenced after S-01 so the save/reload path is verified before layering edit and delete operations.
- **Status:** proposed

### S-03: SRS review session

- **Outcome:** User can start a spaced repetition review session with their saved flashcards; the app shows due cards one by one and schedules each card's next review based on the user's self-rated recall.
- **Change ID:** srs-review-session
- **PRD refs:** FR-009, FR-010
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:**
  - Which spaced repetition library to use? (e.g., ts-fsrs / FSRS-4.5, or a simple SM-2 implementation.) This choice determines the scheduling data model and the columns the review table in F-01 must include. Owner: user. Block: yes.
- **Risk:** Blocked until library choice is made; migrating accumulated review history after first users is costly. Better to decide before first data is written.
- **Status:** blocked

## Backlog Handoff

| Roadmap ID | Change ID          | Suggested issue title                         | Ready for `/10x-plan` | Notes                            |
| ---------- | ------------------ | --------------------------------------------- | --------------------- | -------------------------------- |
| F-01       | flashcard-schema   | Set up flashcard + review schema in Supabase  | yes                   | Run `/10x-plan flashcard-schema` |
| S-01       | ai-generation-flow | AI generation + card review flow (north star) | no                    | Needs F-01 first                 |
| S-02       | deck-management    | Deck management: view, edit, delete cards     | no                    | Needs F-01 + S-01 first          |
| S-03       | srs-review-session | SRS review session                            | no                    | Blocked: SRS library not chosen  |

## Open Roadmap Questions

1. **Source text retention policy** — Do professionals pasting confidential material require a guarantee that submitted text is not stored after card generation completes? Owner: user. Block: S-01 (non-blocking — ships without this commitment, but must be an explicit decision before reaching professional users at scale).
2. **SRS library choice** — Which spaced repetition library to use (e.g., ts-fsrs / FSRS-4.5 vs. simple SM-2)? Determines the review table schema in F-01 and the scheduling logic in S-03. Owner: user. Block: S-03 (yes — S-03 cannot be planned until this is decided).

## Parked

- **No custom SRS algorithm** — Why parked: PRD §Non-Goals — building a proprietary algorithm is expensive and orthogonal to validating the AI generation hypothesis.
- **Multi-format import (PDF, DOCX, image)** — Why parked: PRD §Non-Goals — document parsing adds significant implementation complexity; paste-from-text only in MVP.
- **Shared decks / collaboration** — Why parked: PRD §Non-Goals — requires access control redesign and social features out of scope for single-user validation.
- **Mobile apps (iOS/Android)** — Why parked: PRD §Non-Goals — mobile adds platform overhead before core value is validated on web.

## Done
