# Bootstrap Test Runner + AI-Generation Robustness — Implementation Plan

## Overview

Rollout Phase 1 of `context/foundation/test-plan.md`. The project has **zero
tests** today, so this plan first bootstraps a Vitest runner (jsdom + React
Testing Library), then proves **Risk #1** at two layers: the generate endpoint
returns a clean error state for every bad/empty/error LLM response, and the
React island never crashes or freezes — it always surfaces the error and stays
interactive, keeping the manual-creation fallback (FR-005) reachable.

## Current State Analysis

- **No test infrastructure**: no runner, no `test` script, no test files
  (`package.json:5-13`). Verification today is `npm run lint` + `npm run build`.
- **Endpoint is already defensive** (`src/pages/api/flashcards/generate.ts:25-89`):
  401 unauth → 400 (bad JSON / zod / `<50` words) → **502** when the AI call
  throws (outer catch `:49-61`) → **422** when model output is empty / malformed
  / non-array / has no valid cards (inner catch + guards `:63-88`) → 200 with
  `{ cards }` capped at 15. Fence-stripping at `:11-13,64`.
- **Anti-frozen-UI lives in the island** (`src/components/flashcards/FlashcardGenerator.tsx:42-77`):
  `setIsGenerating(true)` shows a spinner immediately; `try { … } finally {
  setIsGenerating(false) }` guarantees the button re-enables; non-OK → red
  banner (`:57-59,156-158`); network throw → "Nie można połączyć się z
  serwerem." (`:72-73`); `401` → `window.location.href="/auth/signin"`
  (`:52-54`).
- **AI seam** (`src/lib/ai.ts:1-9`): exports `ai` (OpenAI SDK) + `DEFAULT_MODEL`;
  imports `astro:env/server` (`OPENROUTER_API_KEY`, `optional: true` in
  `astro.config.mjs:22`, so no throw when unset). Mocking this module sidesteps
  `astro:env` entirely in endpoint tests.
- **Path alias** `@/*` → `./src/*` (`tsconfig.json:9-11`); `getViteConfig` from
  `astro/config` carries it (and Astro's virtual modules) into Vitest.

This phase is **protective/characterization** coverage — the implementation is
already correct, so assertions derive from the PRD oracle (status + clean error
+ fallback), never from re-reading the handler, and never assert exact card
text (oracle problem).

## Desired End State

- `npm test` runs Vitest headless and passes; `npm run test:watch` exists.
- `tests/pages/api/flashcards/generate.test.ts` proves: each LLM bad-response
  face → the correct status (422) and the AI-throw face → 502 — the **502/422
  split** is explicitly locked — plus happy path + fence-stripping → 200.
- `tests/components/flashcards/FlashcardGenerator.test.tsx` proves: on each
  error the banner appears and the button re-enables (no frozen UI), success
  renders suggestions, and 401 redirects.
- `test-plan.md` §4/§6 reflect the chosen stack and patterns; Phase 1 status →
  `complete`; `change.md` → done.

### Key Discoveries:

- The single most valuable assertion is the **502 (AI throws) vs 422 (malformed
  content)** split — a real past regression fix
  (`context/archive/2026-06-01-ai-generation-flow/reviews/impl-review-phase-1.md:43-51`,
  F3); nothing but a test guards it.
- The "no blank/frozen screen" top fear (interview Q1) is a **client** property
  (`finally`), invisible to endpoint tests → the island layer is required.
- `OPENROUTER_API_KEY` is `optional: true` (`astro.config.mjs:22`) — but
  `vi.mock("@/lib/ai")` means the real module (and `astro:env`) never loads in
  endpoint tests anyway.
- Don't assert exact LLM text (`test-plan.md` §7); model id `:free` is volatile
  — never assert on it.

## What We're NOT Doing

- **No MSW / network-edge mocking** — deferred (decided in research). The Risk
  #1 oracle is *our* handling of the response, faithfully controlled by
  `vi.mock` of the AI seam far more cheaply. Revisit only for e2e/SDK-envelope
  fidelity. Recorded in `test-plan.md` §4.
- **No DB** — Phase 1 is the only DB-free phase; persistence/RLS/cascade are
  Phases 2–4.
- **No CI wiring** — wiring lint/typecheck/test into GitHub Actions is
  `test-plan.md` Phase 5 (and a different lesson). Phase 1 is local runner only.
- **No pre-AI guard tests (401/400)** — the 401 unauth, 400 invalid-body, zod,
  and `<50`-words guards are out of scope for Risk #1 here (auth → Phase 3).
- **No coverage tooling / mutation testing** — not needed to land this phase.
- **No assertions on exact card text or model id.**
- **No changes to production code** — `generate.ts`, `ai.ts`,
  `FlashcardGenerator.tsx` are tested as-is, not modified.

## Implementation Approach

Bootstrap first (no red test is possible for environment setup), then write the
two test layers against unchanged production code, then sync the test-plan
cookbook. Tests live in a **top-level `tests/` directory mirroring `src/`**
(chosen convention; sets precedent for Phases 2–4). The endpoint layer mocks the
AI module and invokes the exported `POST` handler directly with a hand-built
`APIContext`; the island layer renders with RTL + user-event and mocks global
`fetch`.

## Critical Implementation Details

- **Vitest must discover `tests/`, not `src/`.** With a top-level `tests/` dir,
  set `test.include` to `tests/**/*.{test,spec}.{ts,tsx}` in `vitest.config.ts`
  so Vitest doesn't default-scan `src`. The `@/*` alias still resolves via
  `getViteConfig`.
- **Mock the AI module before importing the handler.** `vi.mock("@/lib/ai")`
  must be hoisted (top of file) so `generate.ts`'s top-level
  `import { ai, DEFAULT_MODEL } from "@/lib/ai"` binds to the mock and the real
  `astro:env/server` import never executes.
- **`POST` reads only `context.locals.user` and `context.request`** — a minimal
  fake context (`{ locals: { user: { id } }, request: new Request(url, { method, body }) }`)
  is sufficient; no Astro Container API needed.
- **Island 401 test** asserts a redirect — stub `window.location` (jsdom
  doesn't allow assigning `href` to navigate); restore after. `crypto.randomUUID`
  exists in Node 22 / jsdom, so suggestion mapping works unmocked.

## Phase 1: Bootstrap Test Runner

### Overview

Stand up Vitest with a jsdom environment and React Testing Library, configured
to discover the top-level `tests/` directory, with a smoke test proving the
harness runs green.

### Changes Required:

#### 1. Test dependencies

**File**: `package.json`

**Intent**: Add the dev dependencies needed for both test layers so later
phases need no further installs.

**Contract**: add as `devDependencies` — `vitest`, `jsdom`,
`@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`,
`@testing-library/user-event`, `@vitejs/plugin-react` (only if `getViteConfig`
does not already supply React transform for `.tsx` tests — verify during
implement; the Astro React integration may suffice). Pin to current majors at
install time.

#### 2. Test scripts

**File**: `package.json`

**Intent**: Provide a headless `test` script (used by verification and, later,
CI in Phase 5) and a watch script for local dev.

**Contract**: `"test": "vitest run"`, `"test:watch": "vitest"`.

#### 3. Vitest config

**File**: `vitest.config.ts` (new, project root)

**Intent**: Configure Vitest through Astro so the `@/*` alias and Astro virtual
modules resolve, with a jsdom DOM env and the jest-dom setup loaded globally.

**Contract**: built with `getViteConfig` from `astro/config`; `test.environment
= "jsdom"`; `test.globals = true`; `test.setupFiles = ["./tests/setup.ts"]`;
`test.include = ["tests/**/*.{test,spec}.{ts,tsx}"]`.

```ts
/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
  },
});
```

#### 4. Global test setup

**File**: `tests/setup.ts` (new)

**Intent**: Register jest-dom matchers (`toBeInTheDocument`, `toBeDisabled`,
etc.) for all tests.

**Contract**: `import "@testing-library/jest-dom/vitest";`

#### 5. Smoke test

**File**: `tests/smoke.test.ts` (new)

**Intent**: Prove the runner executes and discovers `tests/`. Removed or kept as
a trivial sanity check at the implementer's discretion.

**Contract**: one trivial `expect(true).toBe(true)` assertion.

### Success Criteria:

#### Automated Verification:

- Dependencies install cleanly: `npm install`
- Test runner executes and passes: `npm test`
- Lint still passes (config + setup files included): `npm run lint`
- Build still passes: `npm run build`

#### Manual Verification:

- `npm run test:watch` starts watch mode and re-runs on file change.

**Implementation Note**: After this phase and all automated verification passes,
pause for human confirmation before proceeding.

---

## Phase 2: Endpoint Robustness Tests

### Overview

Prove the generate endpoint maps every Risk #1 bad-response face to a clean
error status, with the 502/422 split explicitly locked, by mocking the AI seam
and invoking `POST` directly.

### Changes Required:

#### 1. Generate-endpoint test

**File**: `tests/pages/api/flashcards/generate.test.ts` (new)

**Intent**: Characterize the endpoint's response contract for bad/empty/error
LLM responses, derived from the PRD oracle (clean error + fallback), not from
re-reading the handler.

**Contract**: `vi.mock("@/lib/ai")` hoisted; per test, set the mocked
`ai.chat.completions.create` to resolve with a chosen `choices[0].message.content`
string or to reject. Invoke the exported `POST` with a fake `APIContext`
(`locals.user` set, `request` carrying a valid ≥50-word `{ text }` body so
pre-AI guards pass). Assert `response.status` and the parsed `error`/`cards`.
Cases (each a distinct regression):

- malformed/non-JSON content → **422** `"No cards generated"`
- empty string / null content → **422**
- valid JSON but empty array → **422**
- valid JSON but non-array (object / `null`) → **422**
- valid JSON array of objects lacking string `front`+`back` → **422**
- AI call **rejects** (simulated 5xx/timeout/network) → **502** `"AI service
  unavailable"` — and explicitly assert this is **not** 422 (the split)
- valid JSON array of well-formed cards → **200**, `cards` length ≤ 15
- markdown-fenced (` ```json … ``` `) well-formed array → **200** (fence
  stripping works)

No assertions on exact card text or model id.

### Success Criteria:

#### Automated Verification:

- Endpoint tests pass: `npm test`
- Lint passes: `npm run lint`

#### Manual Verification:

- Temporarily inverting the 502/422 split in the handler (locally, not
  committed) makes the split test fail — confirms the test actually guards it.

**Implementation Note**: After this phase and all automated verification passes,
pause for human confirmation before proceeding.

---

## Phase 3: Island Behavioral Tests

### Overview

Prove the React island never crashes or freezes on a failed generation — it
surfaces a clean error, stays interactive, and routes 401 to sign-in — so the
manual-creation fallback stays reachable.

### Changes Required:

#### 1. FlashcardGenerator test

**File**: `tests/components/flashcards/FlashcardGenerator.test.tsx` (new)

**Intent**: Disprove the "blank/frozen screen" top fear (interview Q1; PRD
`:122`) at the layer where it lives, by driving the real handler path via
user-event with a mocked `fetch`.

**Contract**: `vi.stubGlobal("fetch", vi.fn())`; render `<FlashcardGenerator />`
with RTL; type ≥50 words into the textarea (so the Generuj button enables) and
click it via `user-event`. Cases:

- `fetch` resolves non-OK (e.g. 422 `{ error }`) → error banner visible with the
  returned message; button returns from "Generuję…" to enabled "Generuj" (no
  frozen UI).
- `fetch` resolves non-OK 502 → banner shows the 502 message; button re-enabled.
- `fetch` **rejects** (network) → banner shows "Nie można połączyć się z
  serwerem."; button re-enabled.
- `fetch` resolves 200 `{ cards: [...] }` → suggestions render
  (`Sugestie (…)`), no error banner.
- `fetch` resolves 401 → assert redirect: stub `window.location` and assert
  `href` set to `/auth/signin` (restore after).

Assert against behavior/roles/text, not styling (per `test-plan.md` §7).

### Success Criteria:

#### Automated Verification:

- Island tests pass: `npm test`
- Lint passes: `npm run lint`

#### Manual Verification:

- Temporarily removing `finally { setIsGenerating(false) }` (locally, not
  committed) makes the "button re-enabled" assertion fail — confirms the
  anti-frozen-UI guarantee is actually tested.

**Implementation Note**: After this phase and all automated verification passes,
pause for human confirmation before proceeding.

---

## Phase 4: Cookbook + Plan Sync

### Overview

Capture the bootstrapped patterns in the test plan so Phases 2–4 reuse them, and
advance the rollout status.

### Changes Required:

#### 1. Stack + environment

**File**: `context/foundation/test-plan.md` (§4)

**Intent**: Record the chosen runner/stack with versions and the MSW-deferred
decision (resolving the "e.g. MSW" candidate).

**Contract**: fill the §4 table rows for unit+integration and API/HTTP mocking
with `Vitest` / `jsdom` / `@testing-library/react` (+ versions) and a note that
MSW is deferred by cost×signal; add a `checked:` date. Update "Test base today"
line from `none`.

#### 2. Cookbook patterns

**File**: `context/foundation/test-plan.md` (§6.1, §6.2, §6.4, §6.6)

**Intent**: Replace the relevant "TBD — see §3 Phase 1" stubs with concrete,
reusable how-tos from this phase.

**Contract**: §6.1 — how to add a unit/component test (Vitest + RTL, `tests/`
location, setup file). §6.2 / §6.4 — the mocked-AI endpoint pattern
(`vi.mock("@/lib/ai")` + direct `POST(context)` invocation; fake `APIContext`
shape). §6.6 — a 2–3 line note on anything surprising (e.g. top-level `tests/`
choice, AI-module mock sidesteps `astro:env`).

#### 3. Rollout status

**File**: `context/foundation/test-plan.md` (§3 table) and
`context/changes/testing-ai-generation-robustness/change.md`

**Intent**: Advance Phase 1 to `complete` and close the change identity.

**Contract**: §3 Phase 1 Status `researched` → `complete`; `change.md`
`status: planned` → a done state with `updated:` today.

### Success Criteria:

#### Automated Verification:

- Full suite still green: `npm test`
- Lint + build still pass: `npm run lint` && `npm run build`

#### Manual Verification:

- A reader of `test-plan.md` §6 can write a new endpoint/component test without
  reading this plan.

---

## Testing Strategy

### Unit / Component Tests:

- Endpoint: the eight cases in Phase 2 (six → 422, one → 502 with explicit
  split, one → 200, plus fenced → 200).
- Island: the five cases in Phase 3 (422 / 502 / network → banner + re-enable;
  200 → suggestions; 401 → redirect).

### Integration Tests:

- The endpoint tests are integration-style (full request→response through the
  real handler with only the AI network seam stubbed). No DB this phase.

### Manual Testing Steps:

1. `npm test` → all green.
2. Locally invert the 502/422 split → split test fails (then revert).
3. Locally drop the island `finally` → re-enable assertion fails (then revert).

## Performance Considerations

Negligible — tests are in-process with mocked I/O. No real network or DB.

## Migration Notes

None. No production code or data changes.

## References

- Research: `context/changes/testing-ai-generation-robustness/research.md`
- Risk + oracle: `context/foundation/test-plan.md` §2 (Risk #1), §3 Phase 1, §4,
  §7
- History (502/422 split): `context/archive/2026-06-01-ai-generation-flow/reviews/impl-review-phase-1.md:43-51`
- Endpoint under test: `src/pages/api/flashcards/generate.ts:25-89`
- Island under test: `src/components/flashcards/FlashcardGenerator.tsx:42-77`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Bootstrap Test Runner

#### Automated

- [x] 1.1 Dependencies install cleanly: `npm install` — 8e9afb4
- [x] 1.2 Test runner executes and passes: `npm test` — 8e9afb4
- [x] 1.3 Lint still passes: `npm run lint` — 8e9afb4
- [x] 1.4 Build still passes: `npm run build` — 8e9afb4

#### Manual

- [x] 1.5 `npm run test:watch` starts watch mode and re-runs on change — 8e9afb4

### Phase 2: Endpoint Robustness Tests

#### Automated

- [x] 2.1 Endpoint tests pass: `npm test` — 46e428f
- [x] 2.2 Lint passes: `npm run lint` — 46e428f

#### Manual

- [x] 2.3 Inverting the 502/422 split locally makes the split test fail — 46e428f

### Phase 3: Island Behavioral Tests

#### Automated

- [x] 3.1 Island tests pass: `npm test` — f7fe9d7
- [x] 3.2 Lint passes: `npm run lint` — f7fe9d7

#### Manual

- [x] 3.3 Removing the island `finally` locally makes the re-enable assertion fail — f7fe9d7

### Phase 4: Cookbook + Plan Sync

#### Automated

- [x] 4.1 Full suite still green: `npm test`
- [x] 4.2 Lint + build still pass: `npm run lint` && `npm run build`

#### Manual

- [x] 4.3 §6 is self-sufficient for writing a new endpoint/component test
