# AI Generation Flow — Implementation Plan

## Overview

Implement S-01 from the roadmap: a protected `/generate` page where authenticated users paste source text, trigger AI-based flashcard generation, review suggestions (accept/edit/reject inline), and save accepted cards to Supabase. Builds on F-01 (`flashcards` table + RLS) and F-02 (`src/lib/ai.ts` + OpenRouter client).

## Current State Analysis

What exists after F-01 + F-02:
- `src/lib/ai.ts` — `ai` (OpenAI client → OpenRouter) + `DEFAULT_MODEL = "google/gemma-4-26b-a4b-it:free"`
- `src/lib/supabase.ts` — `createClient(headers, cookies)` → auth-aware SSR Supabase client
- `src/types.ts` — `Flashcard`, `FlashcardInsert`, `FlashcardUpdate`
- `src/middleware.ts` — sets `context.locals.user` on every request; protects `/dashboard`
- `src/layouts/Layout.astro` — master layout with cosmic theme
- `src/components/ui/button.tsx` — shadcn Button
- `src/pages/dashboard.astro` — protected dashboard (entry point post-login)

What's missing:
- Any flashcard-related pages, API routes, or React components
- shadcn `Textarea` component

## Desired End State

An authenticated user can:
1. Navigate to `/generate` (linked from dashboard)
2. Paste source text (≥50 words), see live word count
3. Click "Generuj" → spinner appears immediately → full set of cards rendered (all accepted by default)
4. Per card: toggle off (reject), click "Edytuj" for inline edit (two textareas in-place), confirm or cancel
5. Click "Zapisz zaakceptowane" → cards inserted to Supabase → success banner + form reset

Verified by checking Supabase dashboard after save — rows appear in `flashcards` with correct `user_id`.

### Key Discoveries

- `src/lib/ai.ts:1-9` — `ai` and `DEFAULT_MODEL` exported; import directly in generate endpoint
- `src/lib/supabase.ts:6-23` — `createClient(context.request.headers, context.cookies)` returns auth-aware client with RLS-aware session; required for INSERT
- `src/types.ts:9` — `FlashcardInsert = Pick<Flashcard, "front" | "back">` — exact shape for Supabase insert
- `src/middleware.ts:12-13` — `context.locals.user` set before all API routes execute; use for auth guard
- `src/pages/api/auth/signin.ts:1-20` — API route pattern: parse body, guard on `context.locals.user`, return `Response.json()`
- `src/env.d.ts` — `App.Locals.user: User | null` — type-safe access in routes

## What We're NOT Doing

- Source text storage (ephemeral — never written to DB)
- Streaming AI responses (deferred; one-shot is sufficient and simpler)
- Model selection UI (hardcoded `DEFAULT_MODEL`)
- Bulk accept/deselect-all actions
- Redirect to collection after save (S-02 not built yet)
- Hard character cap (soft counter only; not blocking above 3000 chars)
- Retry button on AI error (user re-submits manually)

## Implementation Approach

Three phases build bottom-up: API first (testable in isolation via curl), then React components (built against live API), then page wiring and navigation. Each phase is independently verifiable before the next begins.

## Critical Implementation Details

**AI response parsing requires stripping markdown code fences.** Some models wrap JSON output in ` ```json ... ``` ` blocks. Before `JSON.parse()`, strip the content with a regex targeting leading/trailing markdown fences. Fallback to treating the raw string as JSON directly. Wrap the entire parse in a try/catch — malformed output returns 422.

**Supabase INSERT requires an auth-aware client AND explicit `user_id`.** The RLS policy `WITH CHECK (auth.uid() = user_id)` verifies both conditions independently. Use `createClient(context.request.headers, context.cookies)` to carry the user's session cookie, AND set `user_id: context.locals.user.id` on each inserted row. Using the anon client or omitting `user_id` will silently fail (RLS blocks, insert returns 0 rows).

**`context.locals.user` is the auth guard, not `supabase.auth.getUser()`.** Middleware already resolved the user on every request. In API routes, check `context.locals.user` directly — no need to re-call `getUser()`. Only create the Supabase client when you actually need to write to the DB.

---

## Phase 1: API Layer

### Overview

Two POST endpoints: one calls AI and returns suggestions (no DB write), one saves accepted cards to Supabase. Both require authentication. Also adds the shadcn Textarea primitive needed in Phase 2.

### Changes Required

#### 1. shadcn Textarea component

**File:** `src/components/ui/textarea.tsx` (via `npx shadcn@latest add textarea`)

**Intent:** Add the Textarea primitive needed for the source-text input field in Phase 2.

**Contract:** Run `npx shadcn@latest add textarea`. Creates `src/components/ui/textarea.tsx` in the project's "new-york" shadcn style.

#### 2. Generate endpoint

**File:** `src/pages/api/flashcards/generate.ts`

**Intent:** Accept source text, validate it server-side (Zod + min 50 words), call OpenRouter AI with a structured prompt, parse the JSON response (stripping markdown fences), and return up to 15 `{front, back}` pairs. Never writes to the DB. Returns 401 if unauthenticated, 400 if Zod validation fails, 422 if AI returns empty or malformed output.

**Contract:** `export const prerender = false; export const POST: APIRoute`. Accepts `Content-Type: application/json` body `{ text: string }`. Returns `{ cards: { front: string; back: string }[] }` on success. Auth guard on `context.locals.user`. Zod schema validates `text` is a non-empty string; word count checked after (`text.trim().split(/\s+/).filter(Boolean).length < 50` → 400).

AI prompt (use verbatim — the language-match instruction and JSON-only constraint are load-bearing):

```
You are an expert study aid generator. Extract key concepts from the source text and create flashcard pairs.

Rules:
- Generate up to 15 pairs; quality over quantity — one card per distinct concept worth memorizing
- Use the SAME language as the source text for both front and back
- Front: concise question or prompt
- Back: clear, accurate answer (1–3 sentences)
- Return ONLY a valid JSON array, no preamble, no markdown fences:
[{"front": "...", "back": "..."}, ...]

Source text:
${text}
```

#### 3. Save endpoint

**File:** `src/pages/api/flashcards/index.ts`

**Intent:** Accept an array of accepted `{front, back}` cards, insert them into Supabase as the authenticated user's flashcards, return the count of saved cards. Returns 401 if unauthenticated, 400 if Zod validation fails.

**Contract:** `export const prerender = false; export const POST: APIRoute`. Body: `{ cards: { front: string; back: string }[] }` — Zod validates min 1 item, each `front`/`back` non-empty string. Creates `createClient(context.request.headers, context.cookies)`; inserts all cards as `[...cards.map(c => ({ ...c, user_id: context.locals.user.id }))]` in a single `.insert()` call. Returns `{ saved: number }` on success.

### Success Criteria

#### Automated Verification

- `npm run lint` passes with no errors
- `npm run build` passes (endpoints compile for Cloudflare target)

#### Manual Verification

- `POST /api/flashcards/generate` with valid text + session → returns `{ cards: [{front, back}, ...] }`
- `POST /api/flashcards/generate` without session → 401
- `POST /api/flashcards/generate` with text < 50 words → 400
- `POST /api/flashcards` with `{ cards: [{front: "Q", back: "A"}] }` + session → `{ saved: 1 }`, row visible in Supabase dashboard
- `POST /api/flashcards` without session → 401

**Implementation Note:** After all automated checks pass, pause for manual endpoint testing before proceeding to Phase 2.

---

## Phase 2: UI Components

### Overview

Two React components: `CardReviewItem` (per-card display/edit) and `FlashcardGenerator` (main orchestration: textarea, loading states, card list, save flow). All state is client-side; components call Phase 1 endpoints via `fetch`.

### Changes Required

#### 1. CardReviewItem component

**File:** `src/components/flashcards/CardReviewItem.tsx`

**Intent:** Render a single suggestion card with two modes: display (front/back text + accepted checkbox + "Edytuj" button) and inline edit (two textareas pre-filled with current values + "Zapisz edycję" / "Anuluj" buttons). Parent owns all state; this component calls callbacks on user actions.

**Contract:** Props interface:

```typescript
interface CardReviewItemProps {
  card: {
    id: string;
    front: string;
    back: string;
    accepted: boolean;
    editing: boolean;
    editFront: string;
    editBack: string;
  };
  onToggleAccept: () => void;
  onStartEdit: () => void;
  onSaveEdit: (front: string, back: string) => void;
  onCancelEdit: () => void;
}
```

In edit mode (`card.editing === true`): textareas are controlled with local state initialized from `card.editFront` / `card.editBack`. "Zapisz edycję" calls `onSaveEdit(localFront, localBack)`. "Anuluj" calls `onCancelEdit()`. Rejected cards (`card.accepted === false`) are visually dimmed but remain in the list (user can re-accept).

#### 2. FlashcardGenerator main component

**File:** `src/components/flashcards/FlashcardGenerator.tsx`

**Intent:** Orchestrate the full generation-review-save flow. Manages textarea input, word count, loading states, the suggestions array (per-card state), error display, and success reset.

**Contract:** No props. Internal `SuggestionCard` type (local to file):

```typescript
interface SuggestionCard {
  id: string;          // crypto.randomUUID()
  front: string;
  back: string;
  accepted: boolean;   // true by default on generation
  editing: boolean;    // false by default
  editFront: string;
  editBack: string;
}
```

State shape: `text`, `isGenerating`, `isSaving`, `error: string | null`, `success: string | null`, `suggestions: SuggestionCard[]`.

Key behaviors:
- Word count: `text.trim().split(/\s+/).filter(Boolean).length`; "Generuj" disabled when `wordCount < 50 || isGenerating || isSaving`
- Character counter displayed alongside word count; soft warning at 3000 chars (not blocking)
- On generate: fetch `POST /api/flashcards/generate` with `{ text }`; on success map response to `SuggestionCard[]` (all `accepted: true`, `editing: false`); on error set `error` message
- Save button disabled when `suggestions.filter(c => c.accepted).length === 0 || isSaving`
- On save: fetch `POST /api/flashcards` with `{ cards: suggestions.filter(c => c.accepted).map(c => ({ front: c.front, back: c.back })) }`; on success: set `success = \`Zapisano ${data.saved} kart do kolekcji.\``, clear `suggestions`, clear `text`; on error: set `error`

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- `npm run build` passes (components have no TypeScript errors)

#### Manual Verification

- Textarea shows live word count and character count
- "Generuj" button disabled with < 50 words, enabled at ≥ 50
- Clicking "Generuj" shows spinner immediately (before AI responds)
- Cards appear after generation; all checkboxes checked (accepted)
- Unchecking a card marks it rejected (visually dimmed)
- "Edytuj" switches card to inline edit; "Zapisz edycję" updates display; "Anuluj" reverts
- "Zapisz zaakceptowane" button disabled when 0 cards accepted
- Successful save shows banner "Zapisano N kart do kolekcji." + form reset
- AI error (e.g., blank text after trim) shows inline error message

**Implementation Note:** Test with real `OPENROUTER_API_KEY` in `.dev.vars`. Pause for manual confirmation before Phase 3.

---

## Phase 3: Page + Navigation

### Overview

Wire the components into an Astro page at `/generate`, add it to middleware protection, and add a navigation link from the dashboard.

### Changes Required

#### 1. Generate page

**File:** `src/pages/generate.astro`

**Intent:** Server-rendered protected page at `/generate` that wraps `FlashcardGenerator` in the master Layout. No server-side data fetching — the React component handles all API calls client-side.

**Contract:** Imports `Layout` from `@/layouts/Layout.astro` and `FlashcardGenerator` from `@/components/flashcards/FlashcardGenerator.tsx` with `client:load`. Page `<title>`: "Generuj fiszki — 10xCards". No need for `export const prerender = false` (pages are SSR by default with `output: "server"`).

#### 2. Protect /generate route

**File:** `src/middleware.ts`

**Intent:** Add `/generate` to the auth-protected routes so unauthenticated users are redirected to `/auth/signin`.

**Contract:** Change `PROTECTED_ROUTES` to `["/dashboard", "/generate"]`. No other changes to middleware logic.

#### 3. Dashboard navigation link

**File:** `src/pages/dashboard.astro`

**Intent:** Add a visible "Generuj fiszki" call-to-action on the dashboard so users can reach the generation flow.

**Contract:** Add an anchor element pointing to `/generate` in the dashboard page body. Style consistently with the existing cosmic theme using `cn()` and the Button component or Tailwind anchor classes.

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- `npm run build` passes

#### Manual Verification

- Navigating to `/generate` without session → redirect to `/auth/signin`
- Navigating to `/generate` with valid session → page renders with `FlashcardGenerator`
- Dashboard shows "Generuj fiszki" link → navigates to `/generate`
- Full end-to-end: paste text → generate → accept/reject/edit → save → success banner + reset
- After save: new rows in Supabase dashboard with correct `user_id` and content
- No regressions: dashboard, signin, signup pages still work

**Implementation Note:** Run the complete end-to-end flow before marking S-01 done.

---

## Testing Strategy

### Manual Testing Steps

1. Sign in with a test account
2. Navigate to `/generate` via dashboard link
3. Paste a ≥50-word paragraph
4. Verify word/char counter updates; "Generuj" enabled
5. Click "Generuj" → spinner appears immediately
6. Cards appear; verify all are accepted by default
7. Reject one card, inline-edit another, leave rest unchanged
8. Click "Zapisz zaakceptowane"
9. Verify success banner appears and form clears
10. Open Supabase dashboard → Table Editor → `flashcards` → confirm rows with correct content and `user_id`
11. Without session: navigate to `/generate` → confirm redirect to `/auth/signin`
12. Regression: dashboard, signin, signup still load correctly

## Performance Considerations

AI calls will exceed the Cloudflare Workers free-tier 50ms CPU limit. The Workers paid plan is required before deploying `/generate` to production (tracked in roadmap S-01 risk section). No action needed for local dev.

## References

- Roadmap: `context/foundation/roadmap.md` § S-01
- F-01 plan: `context/changes/db-schema/plan.md`
- F-02 plan: `context/changes/openrouter-client/plan.md`
- AI client: `src/lib/ai.ts`
- Supabase client: `src/lib/supabase.ts`
- Types: `src/types.ts`
- Auth middleware: `src/middleware.ts`
- API route pattern: `src/pages/api/auth/signin.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: API Layer

#### Automated

- [x] 1.1 `npm run lint` passes — 9618416
- [x] 1.2 `npm run build` passes — 9618416

#### Manual

- [x] 1.3 POST /api/flashcards/generate returns cards for valid text + session — 9618416
- [x] 1.4 POST /api/flashcards/generate returns 401 without session — 9618416
- [x] 1.5 POST /api/flashcards/generate returns 400 for text < 50 words — 9618416
- [x] 1.6 POST /api/flashcards saves cards to Supabase, visible in dashboard — 9618416
- [x] 1.7 POST /api/flashcards returns 401 without session — 9618416

### Phase 2: UI Components

#### Automated

- [x] 2.1 `npm run lint` passes
- [x] 2.2 `npm run build` passes

#### Manual

- [ ] 2.3 Textarea shows word counter; Generate button disabled < 50 words
- [ ] 2.4 Generate button shows spinner immediately on click
- [ ] 2.5 Cards appear after generation, all accepted by default
- [ ] 2.6 Per-card reject and inline edit work correctly
- [ ] 2.7 Save button disabled with 0 accepted cards
- [ ] 2.8 Save flow: spinner → success banner + form reset
- [ ] 2.9 AI error shows inline error message

### Phase 3: Page + Navigation

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 `npm run build` passes

#### Manual

- [ ] 3.3 /generate without session → redirect to signin
- [ ] 3.4 /generate with session → page renders correctly
- [ ] 3.5 Dashboard shows "Generuj fiszki" link to /generate
- [ ] 3.6 Full end-to-end flow: text → generate → review → save → persist in Supabase
- [ ] 3.7 No regressions: dashboard, auth pages still work
