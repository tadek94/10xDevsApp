<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Kolekcja fiszek (S-02)

- **Plan**: context/changes/flashcard-collection/plan.md
- **Scope**: Phase 1–2 of 2
- **Date**: 2026-06-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — PATCH zwraca {card}, plan/kryterium 1.3 mówił {id}

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/flashcards/[id].ts:64
- **Detail**: Kontrakt Fazy 1 i kryterium manualne 1.3 mówiły, że PATCH zwraca `{id}` i selektuje tylko `id`. Implementacja selektuje `id, front, back, created_at` i zwraca `{card}`. Świadoma, korzystna ewolucja — `FlashcardItem.onSaved` potrzebuje pełnej karty, by zsynchronizować stan bez dodatkowego round-tripu. Drift tylko z literą planu, nie błąd.
- **Fix**: Zaktualizować brzmienie planu (kontrakt PATCH + kryt. 1.3) na `{card}`.
- **Decision**: ACCEPTED-AS-RULE: Endpointy mutujące pod optymistyczny UI zwracają pełny rekord (lessons.md). Fix planu pominięty świadomie.

### F2 — Pasek nawigacji na /flashcards poza pierwotnym planem

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/flashcards.astro:27-40
- **Detail**: Plan (zmiana #5) dodawał linki tylko *do* kolekcji (z dashboardu i /generate). Pasek powrotny „← Dashboard / Generuj fiszki" na stronie kolekcji to dodatek spoza planu, dodany na wyraźną prośbę użytkownika w trakcie implementacji. Benign, poprawia UX.
- **Fix**: Dopisać do planu jako addendum (zmiana #5: także link powrotny z /flashcards).
- **Decision**: FIXED — plan.md zmiana #5 rozszerzona o `flashcards.astro` (pasek powrotny).

### F3 — SSR ignoruje błąd zapytania → cichy pusty stan

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/pages/flashcards.astro:18-22
- **Detail**: `const { data } = await supabase...` ignoruje pole `error`. Błąd zapytania da `data: null` → kolekcja pokaże empty-state tożsamy z prawdziwie pustą kolekcją; użytkownik z kartami mógłby zobaczyć fałszywe „brak kart". Niskie prawdopodobieństwo przy `data_volume: small`, ale myli błąd z pustką.
- **Fix**: Pobrać też `error`; przy błędzie zalogować `console.error` (spójnie z endpointami) lub przekazać flagę do wyspy.
- **Decision**: SKIPPED — niskie ryzyko przy `data_volume: small`; świadomie odłożone.
