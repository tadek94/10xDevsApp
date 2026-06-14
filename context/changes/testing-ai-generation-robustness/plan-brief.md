# Bootstrap Test Runner + AI-Generation Robustness — Plan Brief

> Full plan: `context/changes/testing-ai-generation-robustness/plan.md`
> Research: `context/changes/testing-ai-generation-robustness/research.md`

## What & Why

Rollout Phase 1 of the test plan. The project has **zero tests**, so we stand up
a Vitest runner and use it to prove **Risk #1**: when the LLM returns corrupted,
empty, error, or timed-out output, the generate flow must show a clean error and
keep the manual-creation fallback reachable — never a blank/frozen screen or a
crash (interview Q1 top fear; PRD `:122`, FR-005).

## Starting Point

The endpoint (`generate.ts`) already maps every bad-response face correctly
(502 when the AI call throws, 422 when output is empty/malformed/non-array), and
the island (`FlashcardGenerator.tsx`) already guards against a frozen UI via
`try/finally`. There is no runner, no `test` script, no test files. So this is
**protective coverage** over already-correct code, not bug repair.

## Desired End State

`npm test` runs Vitest green. Two layers are locked: endpoint tests assert each
LLM bad-response → correct status (and the high-value **502-vs-422 split**), and
island tests assert the error banner appears + the button re-enables (no frozen
UI) + 401 redirects. The test plan's stack (§4) and cookbook (§6) are filled in
so Phases 2–4 reuse the patterns.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Test layers | Endpoint **and** React island | The "no frozen UI" fear is a client property endpoint tests can't prove. | Research |
| Mock seam | `vi.mock("@/lib/ai")` + mocked `fetch` | Faithfully controls the response cheaply; sidesteps `astro:env`. | Research |
| MSW | Deferred | No extra signal for this risk vs the module mock; revisit for e2e. | Research |
| Endpoint invocation | Direct `POST(context)` | Handler reads only `locals.user`+`request`; Container API is needless machinery. | Research |
| Test location | Top-level `tests/` dir mirroring `src/` | Sets the project convention (no precedent existed). | Plan |
| Endpoint scope | 4 LLM faces + 502/422 split (+ happy/fenced) | Locks exactly Risk #1's contract; 400/401 guards left for later. | Plan |
| Island depth | Behavioral via `user-event` | Drives the real handler path to prove re-enable + banner + redirect. | Plan |
| Runner | Vitest via `getViteConfig` + jsdom + RTL | Vite-native fit for Astro; alias + virtual modules resolve. | Research |

## Scope

**In scope:** Vitest bootstrap (config, jsdom, RTL, scripts); endpoint
robustness tests; island behavioral tests; test-plan §4/§6 sync + status.

**Out of scope:** MSW; any DB; CI wiring (Phase 5); pre-AI 401/400 guard tests
(auth → Phase 3); coverage/mutation tooling; any production-code change; exact
card-text or model-id assertions.

## Architecture / Approach

Bootstrap first (env setup has no red test), then write tests against unchanged
production code, then sync the cookbook. Endpoint layer: hoisted
`vi.mock("@/lib/ai")`, resolve/reject the mocked completion, call `POST` with a
fake `APIContext`. Island layer: RTL render + `user-event` click, `fetch`
stubbed per case, `window.location` stubbed for the 401 redirect.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Bootstrap runner | `npm test` green; Vitest+jsdom+RTL config | `getViteConfig`/alias or React `.tsx` transform friction in tests |
| 2. Endpoint tests | 422 faces + 502/422 split + 200/fenced | hoist order of `vi.mock` so `astro:env` never loads |
| 3. Island tests | banner + button re-enable + 401 redirect | jsdom `window.location` stubbing for redirect assertion |
| 4. Cookbook + sync | test-plan §4/§6 patterns; Phase 1 → complete | keeping §6 self-sufficient for later phases |

**Prerequisites:** none (DB-free; can start immediately).
**Estimated effort:** ~1 session across 4 phases.

## Open Risks & Assumptions

- `getViteConfig` supplies the React transform for `.tsx` tests; if not, add
  `@vitejs/plugin-react` (flagged in Phase 1).
- `crypto.randomUUID` is available under Node 22 / jsdom (used by the island).
- Asserting the 502/422 split and the button re-enable are the two
  highest-signal assertions — both are sanity-checked by a local invert/remove
  in manual verification.

## Success Criteria (Summary)

- `npm test` passes; every Risk #1 bad-response face is covered at the endpoint,
  including the 502-vs-422 distinction.
- The island shows a clean error and stays interactive on every failure, and
  redirects on 401 — the "blank/frozen screen" fear is disproven.
- The test plan's cookbook lets the next phase add tests without re-reading this
  plan.
