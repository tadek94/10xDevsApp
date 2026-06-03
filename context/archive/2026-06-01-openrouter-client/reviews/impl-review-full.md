<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: OpenRouter Client (openrouter-client)

- **Plan**: context/changes/openrouter-client/plan.md
- **Scope**: Phases 1–2 of 2
- **Date**: 2026-06-03
- **Verdict**: APPROVED
- **Findings**: 0 critical  0 warnings  2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS (2 observations) |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- `src/lib/ai.ts` — exports `ai` (OpenAI instance, baseURL `https://openrouter.ai/api/v1`, `apiKey: OPENROUTER_API_KEY ?? ""`) and `DEFAULT_MODEL`. Follows the `src/lib/supabase.ts` env-import + null-safety pattern. MATCH (structure).
- `.env.example` and `.dev.vars.example` both contain `OPENROUTER_API_KEY=###`. MATCH.
- Smoke-test route `src/pages/api/ai-test.ts` deleted (not present at HEAD). MATCH.
- Single client imported, not constructed inline: `src/pages/api/flashcards/generate.ts:3,51` imports `ai` + `DEFAULT_MODEL`. Architecture intent respected.
- "What We're NOT Doing" guardrails (no streaming, no model-selection logic, no permanent ai-test route, no prompt engineering) all respected.
- Automated criteria re-verified 2026-06-03 at current HEAD: `npm run lint` exit 0, `npm run build` exit 0. `openai` present in dependencies. Smoke test (Phase 2 manual 2.2) returned "OK" at implementation time.

## Findings

### F1 — DEFAULT_MODEL rozjechał się z planem (łagodnie)

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/ai.ts:4
- **Detail**: Plan kontraktował `DEFAULT_MODEL = "google/gemini-2.0-flash-exp:free"`, a w kodzie jest `"google/gemma-4-26b-a4b-it:free"`. Smoke test Phase 2 (kryterium 2.2) zwrócił "OK", więc bieżący model działa na OpenRouter. Eksperymentalny `gemini-2.0-flash-exp:free` był ulotnym darmowym modelem — podmiana podczas smoke-testu jest uzasadniona; plan sam wskazywał, że model jest tu walidowany. Używany przez `src/pages/api/flashcards/generate.ts:51`.
- **Fix**: Brak akcji w kodzie; ewentualnie addendum w planie dokumentujący finalny model.
- **Decision**: ACCEPTED — benign drift, validated by smoke test; no code change.

### F2 — openai zainstalowany w ^6.39.1, plan zakładał ^4.x

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: package.json (dependencies.openai)
- **Detail**: Plan: `"openai": "^4.x"`. Zainstalowano `^6.39.1` (dwa majory wyżej). `npm run build` przechodzi czysto, użycie API (`ai.chat.completions.create`) kompatybilne, S-01 buduje na tym i działa e2e. `npm install openai` ściąga bieżący major — rozjazd naturalny.
- **Fix**: Brak akcji; build zielony, API kompatybilne.
- **Decision**: ACCEPTED — benign major bump; no code change.
