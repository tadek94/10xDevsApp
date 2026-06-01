# AI Generation Flow — Plan Brief

> Full plan: `context/changes/ai-generation-flow/plan.md`

## What & Why

S-01 is the core product slice: an authenticated user pastes source text, AI generates flashcard suggestions, the user accepts/edits/rejects each card, and accepted cards are saved to their Supabase collection. This directly tests the central product hypothesis — that LLM-generated cards are good enough to keep — and is the prerequisite for S-03 (SRS session has nothing to review without saved cards).

## Starting Point

F-01 provides the `flashcards` table with RLS and TypeScript types. F-02 provides `src/lib/ai.ts` with a ready OpenRouter client (`DEFAULT_MODEL = "google/gemma-4-26b-a4b-it:free"`). The project has auth, a protected dashboard, and a shadcn Button + Layout — but no flashcard-related pages, API routes, or React components.

## Desired End State

An authenticated user navigates to `/generate` from the dashboard, pastes text (≥50 words), clicks "Generuj", sees a spinner immediately, then reviews AI-generated flashcard pairs (all accepted by default). They toggle off cards they don't want, inline-edit any card, and click "Zapisz zaakceptowane". A success banner confirms the save and the form resets. Cards are now in Supabase with correct `user_id`, persisting across reloads.

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Page location | `/generate` dedicated page | Clean URL, easy auth protection, dashboard stays hub | Plan |
| Card default state | Accepted by default (opt-out) | Fewer clicks for 75% acceptance target; conscious rejection > conscious acceptance | Plan |
| Edit UX | Inline (in-place textareas) | No modal needed, no extra component, faster review | Plan |
| Loading UX | One-shot + immediate spinner | Simpler than streaming; NFR "2s feedback" met by spinner appearing in <50ms | Plan |
| Source text retention | Ephemeral only | Privacy for professional users (medical/legal), zero schema change | Plan |
| AI card count | AI decides, cap 15 | Adapts to text length; fixed count wastes cards on short texts | Plan |
| API shape | Two endpoints (generate + save) | Clean separation — generate never touches DB, matches FR-004 | Plan |
| AI output language | Match source text language | Automatic multilingual with no config | Plan |
| AI error handling | Inline error message, user re-submits | Simpler than retry state; errors are rare after F-02 smoke test | Plan |
| Input validation | Min 50 words (button disabled), soft 3000-char counter | Directly from PRD acceptance criteria | Plan |
| Post-save action | Stay on page, reset form | Enables multiple generation sessions; /collection doesn't exist yet | Plan |

## Scope

**In scope:** `/generate` page, `POST /api/flashcards/generate`, `POST /api/flashcards`, `FlashcardGenerator.tsx`, `CardReviewItem.tsx`, middleware route protection, dashboard navigation link, shadcn Textarea.

**Out of scope:** Source text storage, streaming, model selection UI, bulk accept/reject, redirect to /collection, hard character cap.

## Architecture / Approach

React component (`FlashcardGenerator`) manages all UI state client-side and calls two JSON API endpoints. The generate endpoint is stateless (AI call → JSON return, no DB). The save endpoint is the only DB write. Both endpoints rely on `context.locals.user` (set by middleware) for the auth guard.

```
/generate (Astro SSR page)
  └─ FlashcardGenerator.tsx (React, client:load)
       ├─ POST /api/flashcards/generate  →  [{front, back}]  (no DB write)
       └─ POST /api/flashcards           →  {saved: N}  +  Supabase INSERT
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. API Layer | Two working JSON endpoints, testable via curl | AI model returns malformed JSON → handled by try/catch + 422 |
| 2. UI Components | Full interactive review UI: generate, accept/edit/reject, save | Per-card React state management (`editing`, `accepted`, `editFront/Back`) |
| 3. Page + Navigation | Protected `/generate` page, dashboard link, end-to-end flow | Missing `/generate` in `PROTECTED_ROUTES` would silently skip auth redirect |

**Prerequisites:** F-01 and F-02 both `status: implemented`. Local `.dev.vars` must have `OPENROUTER_API_KEY` set.
**Estimated effort:** ~2–3 focused sessions across 3 phases.

## Open Risks & Assumptions

- `DEFAULT_MODEL` is a free-tier model — may have rate limits or quality variance; paid model upgrade needed before production.
- Cloudflare Workers CPU limit: AI API calls will exceed the 50ms free-tier limit. Paid Workers plan required before deploying `/generate` to production (documented in roadmap S-01 risk).
- AI may return malformed JSON despite a strict prompt — handled by try/catch returning 422; user re-submits.

## Success Criteria (Summary)

- User completes the full flow end-to-end: paste text → generate → review → save
- Saved cards survive page reload (confirmed via Supabase dashboard)
- `/generate` redirects unauthenticated users to `/auth/signin`
