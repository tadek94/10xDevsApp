<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Flashcard Schema and RLS Migration (db-schema)

- **Plan**: context/changes/db-schema/plan.md
- **Scope**: Phases 1–3 of 3
- **Date**: 2026-06-03
- **Verdict**: APPROVED
- **Findings**: 0 critical  0 warnings  1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS (1 observation) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- `supabase/migrations/20260528000000_create_flashcards.sql` — matches plan SQL verbatim: table (UUID PK, `user_id` FK → `auth.users` ON DELETE CASCADE, UTC timestamp defaults), `update_updated_at_column()` BEFORE UPDATE trigger, RLS enabled, 4 per-operation policies. UPDATE policy has both `USING` and `WITH CHECK`. MATCH.
- `src/types.ts` — `Flashcard` mirrors all 6 columns; `FlashcardInsert = Pick<Flashcard, "front" | "back">`; `FlashcardUpdate = Partial<Pick<Flashcard, "front" | "back">>`. Exactly as planned. MATCH.
- "What We're NOT Doing" guardrails (no SRS fields, no `position`, no gen-types script, no local Supabase, no seed) all respected. No scope creep.
- Automated criteria re-verified 2026-06-03: `npm run lint` exit 0, `npm run build` exit 0. Migration file present.

## Findings

### F1 — Migracja Phase 1 pominęła GRANT (naprawione później)

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality / Plan Adherence
- **Location**: supabase/migrations/20260528000000_create_flashcards.sql
- **Detail**: Plan i implementacja Phase 1 włączyły RLS + 4 polityki per-operation, ale nie zawierały `GRANT ... TO authenticated`. Na świeżym projekcie Supabase same polityki RLS nie nadają bazowych uprawnień do tabeli — INSERT/SELECT zalogowanego użytkownika kończył się `permission denied for table`. Wychwycone podczas pracy nad S-01/S-02 i naprawione osobną migracją `20260601000000_grant_flashcards_permissions.sql`. Już zapisane w lessons.md ("Supabase Migrations: Always Include Explicit GRANTs"). Stan obecny (HEAD) jest poprawny — obie migracje zastosowane.
- **Fix**: Brak akcji w kodzie — remediacja już istnieje, lekcja zapisana.
- **Decision**: ACCEPTED — already remediated by follow-up migration + recorded as lesson; no code change needed.
