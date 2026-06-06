<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-03 Sesja powtórek SRS

- **Plan**: context/changes/srs-review-session/plan.md
- **Scope**: All 4 phases (Phase 1–4 of 4)
- **Date**: 2026-06-06
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | WARNING |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated success criteria re-run at review time: `npm run lint` → exit 0; `npm run build` → exit 0 (server build complete). All Progress checkboxes for Phases 1–4 are `[x]`, including the 3.5/3.6 manual edge-case + NFR verifications confirmed live.

## Findings

### F1 — Endpoint `GET /api/flashcards/due` nie jest konsumowany przez klienta

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: src/pages/api/flashcards/due.ts (cały plik); src/components/flashcards/ReviewSession.tsx:34-181
- **Detail**: Sesja działa wyłącznie na snapshotcie `initialCards` z SSR (`review.astro` robi własne zapytanie due). Wyspa nigdy nie woła `GET /api/flashcards/due`, więc endpoint to nieużywana powierzchnia API. Był jednak jawnie zakontraktowany w planie (Faza 3 §1) — to nie scope-creep, lecz funkcja zaplanowana, która w obecnym UI nie ma wywołującego. Pole `srs_due` zwracane przez `review.ts` też nie jest konsumowane przez wyspę.
- **Fix A ⭐ Recommended**: Zostawić endpoint jako udokumentowaną przyszłą powierzchnię API + dopisać jedną linię w planie/README, że `due.ts` jest API-only (nieużywane przez obecny UI, przewidziane pod re-fetch/SPA-refresh).
  - Strength: Zachowuje zaplanowaną pracę; mirroruje istniejący wzorzec `flashcards/index.ts` (też wystawia GET niezależnie od SSR); zero ryzyka regresji.
  - Tradeoff: Pozostaje kod bez testu integracyjnego od strony klienta.
  - Confidence: HIGH — endpoint jest poprawny i zgodny ze wzorcem, brak tylko konsumenta.
  - Blind spot: Brak automatycznego testu, który wychwyciłby przyszłą regresję kontraktu `due`.
- **Fix B**: Podpiąć wyspę pod `due.ts` (re-fetch przy montażu / po zakończeniu sesji zamiast polegać tylko na SSR-snapshot).
  - Strength: Endpoint zyskuje realnego konsumenta; sesja odświeża stan bez pełnego reloadu strony.
  - Tradeoff: Większy zakres niż plan; dubluje zapytanie SSR przy pierwszym wejściu; do rozważenia dopiero gdy potrzebny dynamiczny refresh.
  - Confidence: MEDIUM — wymaga decyzji produktowej o modelu odświeżania.
  - Blind spot: Nie sprawdzono, czy są dalsze plany SPA-refresh, które by to uzasadniły.
- **Decision**: FIXED via Fix A — dopisano notkę "API-only" przy kontrakcie due.ts w plan.md (Faza 3 §1).

### F2 — Ocena karty podbija `updated_at` przez trigger

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/flashcards/[id]/review.ts:67-71
- **Detail**: UPDATE stanu SRS odpala `update_updated_at_column` z migracji `20260528000000`, więc każda ocena zmienia `updated_at`. Jeśli kolekcja sortuje/wyświetla `updated_at` jako "ostatnia edycja treści", aktywność powtórkowa będzie ją zaburzać (karta przesunie się na górę listy mimo braku edycji front/back).
- **Fix**: Potwierdzić zamierzone znaczenie `updated_at`. Jeśli ma śledzić tylko edycję treści — sortować kolekcję po `created_at`, albo wykluczyć kolumny `srs_*` z triggera (warunek `WHEN`).
- **Decision**: SKIPPED — `updated_at` jako "ostatnia aktywność" jest akceptowalne dla MVP.

### F3 — Read-modify-write stanu SRS nie jest atomowy

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/flashcards/[id]/review.ts:53-71
- **Detail**: SELECT → `review()` → UPDATE to sekwencja nieatomowa. Dwie równoległe oceny tej samej karty (np. dwie karty przeglądarki) mogłyby się ścigać na stanie SRS. Praktyczny wpływ niski: przepływ jest jednoużytkownikowy, a wyspa blokuje podwójny submit (`isSubmitting` + `disabled`).
- **Fix**: Brak działania wymaganego — odnotowane jako świadome ograniczenie MVP. Atomowość (np. RPC/transakcja) dopiero gdyby pojawił się współbieżny zapis.
- **Decision**: FIXED — optymistyczna blokada `.eq("srs_reps", rows[0].srs_reps)` na UPDATE w review.ts; pusty UPDATE po potwierdzonym istnieniu → 409 Conflict (wyspa pokazuje błąd i pozwala ponowić).

### F4 — `SrsState` pomija `srs_elapsed_days` (8 pól zamiast planowanych 9)

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/types.ts:36-46
- **Detail**: Plan mówił "SrsState = 9 pól srs_*"; faktyczny typ ma 8 — celowo pominięto `srs_elapsed_days`, bo ts-fsrs przelicza `elapsed_days` z `last_review` (udokumentowane komentarzem, spójnie zastosowane w `srs.ts` i `review.ts`). Kolumna nadal istnieje w bazie z defaultem, więc backfill i migracja są poprawne. Świadoma, udokumentowana odchyłka — nie defekt.
- **Fix**: Brak działania. Ewentualnie dopisać jedno zdanie w planie, że `srs_elapsed_days` jest utrwalane w schemacie, ale nie w `SrsState` (pochodne ts-fsrs).
- **Decision**: FIXED via dopisanie notki — notka F4 dodana przy kontrakcie `SrsState` w plan.md (Faza 2 §2).

### F5 — `review.astro` ignoruje błąd zapytania SSR

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/review.astro:13-23
- **Detail**: `const { data }` pomija `error` i degraduje do `[]`, więc błąd bazy renderuje się jako "brak kart" zamiast stanu błędu. Zachowanie jest **spójne** z bliźniaczym `flashcards.astro` (ta sama decyzja), więc to nie regresja, lecz odziedziczony wzorzec.
- **Fix**: Brak działania wymaganego dla spójności. Jeśli kiedyś dodacie stan błędu SSR — zrobić to jednocześnie w `review.astro` i `flashcards.astro`.
- **Decision**: FIXED — przechwycenie i `console.error` błędu SELECT-a (obserwowalność) dodane spójnie w review.astro i flashcards.astro; zachowany fallback `[]`. Pełny stan błędu w UI (przewleczenie propsa przez wyspę) świadomie odłożony.
