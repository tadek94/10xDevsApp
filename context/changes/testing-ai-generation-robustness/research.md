---
date: 2026-06-14T00:00:00Z
researcher: karczynski_t
git_commit: 5767599a9ffd6722dac337811fca9d047ad15c1d
branch: main
repository: 10xDEVS
topic: "Oracle + bootstrap for Risk #1 — generate flow stays sane on bad/empty/error/slow LLM responses"
tags: [research, codebase, ai-generation, testing, vitest, risk-1]
status: complete
last_updated: 2026-06-14
last_updated_by: karczynski_t
---

# Research: Risk #1 — AI-generation robustness (Phase 1 bootstrap)

**Date**: 2026-06-14
**Researcher**: karczynski_t
**Git Commit**: 5767599a9ffd6722dac337811fca9d047ad15c1d
**Branch**: main
**Repository**: 10xDEVS

## Research Question

For Rollout Phase 1 of `context/foundation/test-plan.md` ("Bootstrap +
AI-generation robustness", Risk #1): establish the **oracle** — what the
generate flow *should* do (from sources, not from the implementation) when
OpenRouter returns malformed JSON, empty content, a 5xx, or a timeout — and
decide the **bootstrap test stack**, since the project has zero tests today.

Risk #1: *LLM call returns a corrupted, empty, error, or timed-out response
and the generate flow breaks — blank/frozen screen or crash instead of a
clean error plus manual-creation fallback.*

## Summary

The oracle resolves cleanly from sources. PRD pins three things: feedback
appears within 2 s with **no blank/frozen UI** (`prd.md:122`); manual creation
is an explicit **resilience fallback** for when generation fails
(`prd.md:90-91`, FR-005); and ≥50-word input must produce at least one card
(`prd.md:64`). The current implementation already maps every bad-response face
to a clean error — the work is **protective coverage** that locks these
contracts against regression, not bug-finding. There is **one past fix worth
pinning hardest**: the split `try/catch` that distinguishes a thrown AI call
(→ 502) from unparseable model output (→ 422); these were once a single catch
and that collapse was a real defect (history F3).

Risk #1 has **two faces that need two layers**, both cheap and DB-free:

1. **Endpoint** (`src/pages/api/flashcards/generate.ts`) — proves a clean
   error *state* (correct status + body) is produced for each bad response.
2. **React island** (`src/components/flashcards/FlashcardGenerator.tsx`) —
   proves **no frozen/blank UI**: the spinner shows, the button re-enables on
   failure (`try/finally`), the error banner renders, and 401 redirects. The
   endpoint test alone does **not** cover the top user fear ("blank/frozen
   screen") — that property lives in the island.

**Stack recommendation:** Vitest (via `getViteConfig` from `astro/config`) +
`@testing-library/react` + jsdom. Mock the AI seam with `vi.mock("@/lib/ai")`
(endpoint) and mock `fetch` with `vi.stubGlobal` (island). **Defer MSW** — it
adds setup cost without extra signal for this risk (see decision below). This
is a deliberate cost×signal call that resolves test-plan §4's "e.g. MSW"
candidate.

## Detailed Findings

### The oracle (from sources — PRD)

- **FR-003** (`prd.md:82`): "User can paste source text and trigger
  AI-generated flashcard suggestions. Priority: must-have."
- **FR-004** (`prd.md:86`): accept / edit / discard each suggestion before
  saving.
- **FR-005** (`prd.md:90-91`): "User can create a flashcard manually." The
  rationale is load-bearing: *"manual creation is a safety net for when AI
  generation produces poor results… Without it, a failed generation session
  leaves the user with nothing. It is a resilience feature."* → this is what
  "manual-creation fallback" means.
- **NFR — no frozen UI** (`prd.md:122`): "The user sees visible progress
  feedback within 2 seconds of submitting source text for generation; no blank
  screen or frozen UI while the AI processes the request." Reinforced by
  US-01 acceptance (`prd.md:67`).
- **Min-input rule** (`prd.md:64`): "At least one card is generated for any
  text input of ≥ 50 words."
- No generation-specific **Guardrail** exists; the only guardrail
  (`prd.md:52`) is about edit persistence (Risk #2, not this phase). The
  resilience contract for Risk #1 is encoded in FR-005's rationale.

### What "clean error + manual-creation fallback" means in THIS app

- Generation lives entirely in one React island mounted at **`/generate`**:
  `generate.astro:10` → `<FlashcardGenerator client:load />`.
- **Clean error** = the island catches every failure and renders an inline red
  banner; it never blanks or freezes. Mechanisms in
  `FlashcardGenerator.tsx`:
  - `setIsGenerating(true)` immediately → spinner at `:142-152` satisfies the
    "feedback within 2 s" NFR.
  - `try { … } finally { setIsGenerating(false) }` (`:46-76`) guarantees the
    button always re-enables — **this is the anti-frozen-UI guarantee**.
  - non-OK → `setError(data.error ?? "Wystąpił błąd podczas generowania.")`
    (`:57-59`); network throw → `"Nie można połączyć się z serwerem."`
    (`:72-73`); banner renders at `:156-158`.
  - `401` → `window.location.href = "/auth/signin"` (`:52-54`).
- **Manual-creation fallback** is a **separate route**, not an affordance
  inside the generator: **`/flashcards`** → `FlashcardCollection.tsx` "Dodaj
  kartę" (`:79-90`) → inline form → POST `/api/flashcards`. `ScreenNav.astro`
  (`:11-25`) links `/generate` and `/flashcards` as peers, so a user whose
  generation fails navigates to the collection and adds cards by hand. The
  fallback is **reachable but decoupled** — the generator offers no manual-add
  button.

### Endpoint contract — the four bad-response faces

`src/pages/api/flashcards/generate.ts` (HEAD), confirmed line-by-line:

| Bad-response face (Risk #1) | Code path | Status | Body `error` |
|---|---|---|---|
| AI call throws — 5xx, timeout, network, missing key | outer `try/catch` `:49-61` | **502** | `"AI service unavailable"` |
| Empty / null model content | `raw = … ?? ""` `:58` → `JSON.parse("")` throws → inner catch `:86-88` | **422** | `"No cards generated"` |
| Malformed / non-JSON content | `JSON.parse` throws → inner catch `:86-88` | **422** | `"No cards generated"` |
| Valid JSON but empty array / non-array / `null` | `:67-69` | **422** | `"No cards generated"` |
| Valid JSON array but no object has string `front`+`back` | filter → `validated.length === 0` `:81-83` | **422** | `"No cards generated"` |
| Markdown-fenced JSON (` ```json … ``` `) | `stripMarkdownFences` `:11-13,64` → parses → **200** | 200 | `{ cards: [...] }` (≤15) |
| Happy path | `:71-85` | **200** | `{ cards: [...] }` each `{front,back}`, capped 15 |

Pre-AI validation (also worth one assertion each — they are the "clean error"
guards before the model is ever called): 401 unauth (`:26-28`), 400 invalid
JSON body (`:31-35`), 400 zod empty/`>10000` (`:37-40`), 400 `<50` words
(`:43-46`).

**The single most valuable assertion (history F3):** a *thrown* AI call must
yield **502**, and a *successful* call returning malformed content must yield
**422**. These were once one combined catch; collapsing them back is the most
likely future regression and the client relies on neither distinction, so only
a test guards it.

### React-island contract — the anti-frozen-UI face

For each of {422, 502, 400} and a rejected `fetch` (network), the oracle
(`prd.md:122`) requires, in `FlashcardGenerator.tsx`:

- the error banner becomes visible with a non-empty message;
- the button leaves the "Generuję…" disabled/spinner state (i.e.
  `isGenerating` is reset by the `finally` — proves no frozen UI);
- on success, suggestions render and no error shows;
- `401` triggers a redirect to `/auth/signin` (not a banner).

This layer is where "blank/frozen screen" (interview Q1, the top fear) is
actually disproven. Endpoint status codes are necessary but not sufficient.

### Bootstrap stack — grounded decisions

- **Runner: Vitest** via `getViteConfig()` from `astro/config` in
  `vitest.config.ts` (current Astro testing guide). `getViteConfig` loads the
  Astro/Vite config so the **`@/*` tsconfig path alias** and Astro's virtual
  modules resolve in tests. (Context7: withastro/docs — "Basic Vitest
  Configuration for Astro", `getViteConfig()`.)
- **Component layer: `@testing-library/react` + `@testing-library/jest-dom` +
  jsdom** (`test.environment: "jsdom"`) with a setup file for the jest-dom
  matchers. React 19 + RTL is current.
- **AI seam: `vi.mock("@/lib/ai")`** — replaces `ai` and `DEFAULT_MODEL` so
  the real `src/lib/ai.ts` (and its `astro:env/server` import) never loads. The
  endpoint's `POST` is invoked directly with a hand-built `APIContext`
  (`{ locals: { user }, request }`) — sufficient because the handler only reads
  `context.locals.user` and `context.request`. Mock **resolves** with a chosen
  content string (covers malformed/empty/array faces) or **rejects** (covers
  the 502 face). This exercises *our* parsing/branching — exactly the Risk #1
  oracle.
- **Island fetch: `vi.stubGlobal("fetch", vi.fn())`** returning a `Response`
  per status, or rejecting for the network face; stub `window.location` for the
  401-redirect assertion. `crypto.randomUUID` exists in Node 22 / jsdom.

### Decision: defer MSW (resolves test-plan §4 "e.g. MSW")

The test plan named MSW as a *candidate* and left the choice to this research.
**Recommendation: do not adopt MSW in Phase 1.** Reasoning (cost×signal):

- The Risk #1 oracle is "how *our code* handles the response" — the parsing,
  fence-stripping, validation, and the 502-vs-422 branch. The faithful seam is
  `ai.chat.completions.create`'s return/throw, which `vi.mock` controls
  exactly and far more cheaply than standing up an MSW server + resolving
  `astro:env/server` + setting a key.
- MSW's extra fidelity is the **OpenAI SDK envelope parse** and **real HTTP
  5xx → SDK throw**. But the SDK throwing on 5xx/timeout is established library
  behaviour; our contract is only "SDK throws → 502", which the rejecting mock
  proves directly.
- The "timeout **under workerd**" concern cannot be reproduced in Vitep/Node
  at all (tests don't run in workerd; the 50 ms limit is CPU, not wall-clock).
  MSW would not buy that fidelity — it belongs to a pre-prod smoke, not a unit
  test. (history: workerd risk was retired by a temporary smoke route, now
  deleted.)
- Revisit MSW only if a future phase needs SDK-envelope or browser-level
  fidelity (e.g. e2e). Record the deferral in test-plan §4 when Phase 1 lands.

## Code References

- `src/pages/api/flashcards/generate.ts:25-89` — endpoint; 401/400/400/400 →
  502 (outer catch) → 422 (inner catch) → 200.
- `src/pages/api/flashcards/generate.ts:11-13` — `stripMarkdownFences`.
- `src/lib/ai.ts:1-9` — OpenAI client, `DEFAULT_MODEL`, `apiKey ?? ""` (no
  throw on missing key); imports `astro:env/server`.
- `src/components/flashcards/FlashcardGenerator.tsx:42-77` — `handleGenerate`:
  spinner, `try/finally`, error states, 401 redirect.
- `src/components/flashcards/FlashcardGenerator.tsx:156-158` — error banner.
- `src/pages/generate.astro:10` — island mount at `/generate`.
- `src/components/flashcards/FlashcardCollection.tsx:29-58,79-90` — manual-add
  fallback (FR-005).
- `astro.config.mjs:22` — `OPENROUTER_API_KEY` is `optional: true` (so
  `astro:env` does not throw when unset; module-mock sidesteps it regardless).
- `prd.md:64,82,86,90-91,122` — oracle sources.

## Architecture Insights

- The endpoint is already defensive across every Risk #1 face; this phase is
  **characterization/protection**, not repair. No mirror-test trap exists *as
  long as* assertions derive from the PRD oracle (status + "clean error +
  fallback") and never assert exact card text (oracle problem; test-plan §7).
- The split 502/422 is the highest-value regression to pin — it was a real
  past defect and nothing else guards it.
- The "no frozen UI" guarantee is a **client** property (`finally`), invisible
  to endpoint tests — hence the two-layer plan.
- Generate and manual-create are **decoupled routes**; "fallback works" is
  proven by (a) generation failing cleanly and (b) `/api/flashcards` manual
  POST staying available — the latter is exercised more deeply in Phase 2, so
  Phase 1 need only assert the manual route/endpoint exists and the generator
  degrades cleanly, not re-test persistence.

## Historical Context (from prior changes)

- `context/archive/2026-06-01-ai-generation-flow/reviews/impl-review-phase-1.md:43-51`
  (F3) — the split outer/inner `try/catch` (502 vs 422) was a review fix; before
  it, a single catch made network failure indistinguishable from malformed
  JSON. **Pin this.**
- Same review (F2, `:36-41`) — the `max(10000)` input cap was added in review
  (was unbounded). (F7, `:84-92`) — save capped at `.max(15)`.
- `context/archive/2026-06-01-ai-generation-flow/reviews/impl-review-full.md:49-58`
  (F11) — 401 mid-session → `window.location.href="/auth/signin"`; accepted
  tradeoff: typed text is lost on redirect (so the redirect, not a banner, is
  the 401 oracle).
- `context/archive/2026-06-01-openrouter-client/reviews/impl-review-full.md`
  (F1) — model is `google/gemma-4-26b-a4b-it:free`; `:free` models are
  withdrawn without warning (don't hard-code model assertions). (F2) — `openai`
  SDK is `^6.x`. Client sets **no timeout/retry** (SDK default), confirming
  timeout handling lives at the endpoint catch → 502.
- `lessons.md` — GRANT, `getSession()` hydration, full-record-return: all Risk
  #2/#3 concerns, **out of scope** for this DB-free phase.

## Related Research

- `context/foundation/test-plan.md` §2 (Risk #1 row + Risk Response
  Guidance), §3 Phase 1, §4 (stack/env — this research resolves the MSW
  candidate), §7 (don't assert exact LLM text).
- `context/archive/2026-06-01-ai-generation-flow/` and
  `context/archive/2026-06-01-openrouter-client/` — full generate-flow history.

## Open Questions (decide in /10x-plan)

1. **Scope: include the React-island layer in Phase 1, or endpoint-only?**
   Recommendation: **include it.** The top user fear ("blank/frozen screen")
   is a client property the endpoint tests cannot prove. It is cheap (jsdom +
   mocked fetch, no DB, no MSW). This is the main decision for the plan.
2. **MSW now or deferred?** Recommendation: **deferred** (reasoning above). If
   rejected, Phase 1 grows a setupServer + `astro:env` resolution + test key.
3. **Endpoint invocation: direct `POST(context)` vs Astro Container API
   (`renderToResponse`, `routeType:"endpoint"`)?** Recommendation: **direct
   handler** — the handler reads only `locals.user` + `request`; Container API
   is heavier machinery with no added signal here.
4. Out of scope (note, don't test now): UI char-limit mismatch (warns at 3000,
   endpoint caps 10000); per-status distinct user messages (PRD doesn't require
   — generic banner is acceptable).
