# S-03: Sesja powtórek SRS — Plan Brief

> Full plan: `context/changes/srs-review-session/plan.md`
> Research: `context/changes/srs-review-session/research.md`

## What & Why

Domknięcie north-star: po S-01 (generacja) użytkownik uruchamia sesję spaced repetition na zapisanych fiszkach. Aplikacja pokazuje karty wymagalne w kolejności wyznaczonej przez algorytm FSRS i zapamiętuje wyniki do następnej sesji (PRD FR-009, FR-010). Dowodzi, że produkt działa end-to-end.

## Starting Point

Tabela `flashcards` ma tylko pola treści (zero kolumn SRS). Istnieją sprawdzone wzorce: trasy API (`getSession()` + zwrot pełnego rekordu), strona+wyspa React (`flashcards.astro`), middleware z `PROTECTED_ROUTES`. Biblioteka `ts-fsrs` wybrana (external-research) i potwierdzona jako zgodna (research, werdykt GO).

## Desired End State

Zalogowany użytkownik wchodzi na `/review`, ocenia karty pojedynczo (Again/Hard/Good/Easy), każda ocena natychmiast aktualizuje stan FSRS karty i przesuwa `srs_due` w przyszłość. Wynik przeżywa reload; druga sesja tego dnia pokazuje stan pusty. Karty innego konta niedostępne (NFR).

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Biblioteka SRS | `ts-fsrs` | Dojrzała, zero-dep, edge-safe, prawdziwy FSRS | Research |
| Typ dat SRS | TIMESTAMPTZ | Spójność z `created_at`, naturalne ORDER BY, reguła UTC/formatDate | Plan |
| Backfill istniejących kart | Kolumny `NOT NULL DEFAULT` | Defaulty = stan "nowej karty FSRS", zero null-handlingu | Plan |
| Zapis ocen | Per-karta, natychmiast | Guardrail PRD "wynik przeżywa reload"; mirror PATCH | Plan |
| Skład sesji | Tylko wymagalne (`srs_due ≤ now`), sort rosnąco | To jest "kolejność wg algorytmu SRS" z FR-009 | Plan |
| Mała talia | Notka, bez blokady | Spełnia FR-009 "zakomunikuj", nie blokuje north-star | Plan |
| Przyciski oceny | 4 oceny FSRS | Pełna jakość harmonogramu, standard Anki | Plan |
| Granica dat | Centralnie w `src/lib/srs.ts` | `Date` nie wycieka do tras/propsów; zgodne z `formatDate` | Research |

## Scope

**In scope:** migracja SRS (9 kolumn + indeks), typy, serwis `src/lib/srs.ts` (FSRS + konwersja dat), `GET /api/flashcards/due`, `POST /api/flashcards/[id]/review`, strona `/review` + wyspa `ReviewSession`, ochrona trasy, linki wejścia.

**Out of scope:** podgląd interwału na przyciskach, nowe komponenty shadcn, twarde minimum talii, wersjonowanie wag FSRS, historia/ReviewLog, learn-ahead, optymalizator Rust/WASI.

## Architecture / Approach

Pionowy slice po znanych wzorcach: migracja rozszerza istniejącą `flashcards` (bez nowych RLS/GRANT — istniejące obejmują nowe kolumny). Cała logika FSRS i konwersja `Date↔ISO` w jednym module `src/lib/srs.ts`. Trasy API i UI mirrorują flashcards 1:1. Przepływ: `/review` (SSR-fetch due) → wyspa pokazuje karty → ocena → `POST review` → `srs.review()` → UPDATE → następna karta.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Migracja + typy | 9 kolumn SRS + indeks, rozszerzony `Flashcard` | Defaulty muszą odpowiadać `createEmptyCard()` |
| 2. Serwis SRS | `src/lib/srs.ts`, instalacja `ts-fsrs` | Hydratacja Card odporna na wersję (start od `createEmptyCard()`) |
| 3. Trasy API | due + review, per-karta zapis | Spełnić 3 warunki RLS (GRANT/getSession/policy) |
| 4. UI sesji | `/review` + wyspa + stany brzegowe | Utrwalenie per-karta vs reload |

**Prerequisites:** F-01 + S-01 (`done`); lokalny Supabase do migracji; `ts-fsrs` z npm.
**Estimated effort:** ~2-3 sesje, 4 fazy.

## Open Risks & Assumptions

- Intra-day learning-steps (ts-fsrs 5.x) nie są utrwalane — `toCard` seeduje je z `createEmptyCard()`. Akceptowalne dla MVP; pełna wierność = dodać kolumnę później.
- Brak test runnera → weryfikacja = `lint` + `build` + ręczne testy; logika `srs.ts` to przyszły kandydat na testy.
- `npx supabase db reset` wymaga działającego lokalnego Supabase (Docker).

## Success Criteria (Summary)

- Użytkownik kończy pełny flow: generacja (S-01) → sesja powtórek (S-03) z oceną kart.
- Ocena karty przeżywa reload strony (guardrail PRD).
- Druga sesja tego dnia respektuje harmonogram (stan pusty gdy nic niewymagalne); karty innego konta niedostępne (NFR).
