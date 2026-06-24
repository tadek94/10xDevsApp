<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Persistence & Data Integrity Tests (Phase 2)

- **Plan**: context/changes/persistence-data-integrity/plan.md
- **Scope**: Full plan (4 phases)
- **Date**: 2026-06-24
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS (unit 17 · integration 10 · lint 0 errors · build ✓) |

## Findings

### F1 — Teardown depends on FK cascade that no test asserts

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: tests/integration/helpers/auth.ts:37 (deleteTestUser)
- **Detail**: Cleanup deletes only the user and relies on ON DELETE CASCADE to remove flashcards. The cascade is present today (supabase/migrations/20260528000000_create_flashcards.sql:4), so no leak now — but a future migration changing the FK to RESTRICT would make teardown throw and leak users+cards into the shared cloud test project, with nothing to surface it.
- **Fix**: In smoke.integration.test.ts, create a card then assert it's gone after deleteTestUser — turns a silent future regression into a failing test.
- **Decision**: FIXED — smoke now creates a card via the POST handler, asserts it exists, deletes the user, and asserts the card is gone (cascade).

### F2 — Due-ordering test lacks a length guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: tests/integration/flashcards/due.integration.test.ts:71-78
- **Detail**: The test filters the due list to the two seeded ids then asserts toEqual([earlier, later]). If a card were missing, the failure message is about order, not the real cause (missing card).
- **Fix**: Add expect(ordered).toHaveLength(2) before the order assertion for a clearer failure mode.
- **Decision**: FIXED — added expect(ordered).toHaveLength(2) before the order assertion.

### F3 — "again < good" is coupled to ts-fsrs learning-step behavior

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Architecture (test design)
- **Location**: tests/integration/flashcards/review.integration.test.ts:71-85
- **Detail**: The ordering oracle assumes a new card's "again" interval < "good". This is a legitimate FSRS behavioral invariant (verified stable 5/5), but a future ts-fsrs upgrade with different learning steps could theoretically shift it. No action needed — flagging the one assertion tied to scheduler internals.
- **Decision**: SKIPPED — accepted as a legitimate, verified-stable invariant; no code change.
