# Kolekcja fiszek (S-02) — Plan Brief

> Full plan: `context/changes/flashcard-collection/plan.md`

## What & Why

Dostarczyć zarządzanie zapisaną kolekcją fiszek (FR-005–008): widok listy, ręczne tworzenie karty, edycję i usuwanie z potwierdzeniem. Domyka ścieżkę „mam karty → mogę nimi zarządzać" niezależnie od generowania AI (S-01) i jest wymaganą podstawą pod sesję powtórek (S-03).

## Starting Point

Tabela `flashcards` (F-01) już istnieje z kompletem polityk RLS (SELECT/INSERT/UPDATE/DELETE) i GRANT-ami; typy w `src/types.ts` gotowe. Istnieje `POST /api/flashcards` (batch save z S-01) ustalający wzorzec zod + hydratacja `getSession()` + RLS. Brakuje endpointu edycji/usuwania pojedynczej karty i całego widoku kolekcji.

## Desired End State

Zalogowany użytkownik wchodzi na `/flashcards`, widzi swoje karty (najnowsze u góry), dodaje nowe przez inline-formularz, edytuje front/back i usuwa po dwustopniowym potwierdzeniu. Każda operacja przeżywa reload (lista SSR-owana z bazy). Niezalogowany jest przekierowany na signin.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Render listy | SSR + hydratacja React-island | Świeżość po reloadzie z definicji spełnia guardrail PRD | Plan |
| Kształt API | Dynamiczny route `[id].ts` (PATCH + DELETE) | RESTowo czyste, izolacja przez RLS na `id` | Plan |
| Ręczne tworzenie | Inline-formularz na stronie kolekcji | Jeden ekran, reuse istniejącego `POST` i wzorca `EditForm` | Plan |
| Potwierdzenie usuwania | Inline dwustopniowe („Na pewno? Tak/Anuluj") | Zero zależności, dostępne, spójne z paletą cosmic | Plan |
| Route i nawigacja | `/flashcards` + linki z dashboard i `/generate` | Czytelny URL spójny z `/generate` | Plan |

## Scope

**In scope:** lista (SSR), ręczne tworzenie, edycja, usuwanie z potwierdzeniem, ochrona route'u, linki nawigacyjne, empty-state.

**Out of scope:** migracje/zmiany schematu, paginacja/wyszukiwanie, soft-delete, edycja wsadowa, komponent shadcn Dialog, osobny GET listy.

## Architecture / Approach

`/flashcards.astro` (SSR) pobiera karty przez Supabase z `Astro.locals` i przekazuje jako `initialCards` do wyspy `FlashcardCollection`, która zarządza stanem listy i deleguje render pojedynczej karty do `FlashcardItem` (podgląd / inline-edit / dwustopniowy confirm). Operacje idą przez `fetch`: tworzenie → istniejący `POST /api/flashcards` (rozszerzony o zwrot rekordów), edycja/usuwanie → nowy `PATCH`/`DELETE /api/flashcards/[id]`. Każdy endpoint: zod → `getSession()` → operacja pod RLS.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Warstwa API | `[id].ts` z PATCH + DELETE | Pominięcie `getSession()` → RLS odrzuca (reguła z lessons.md) |
| 2. Strona + UI | `/flashcards` SSR + island (lista, create, edit, delete) + nawigacja | Regresja w odczycie `saved` przez `FlashcardGenerator` po zmianie odpowiedzi POST |

**Prerequisites:** F-01 (db-schema) — gotowe. Brak innych zależności.
**Estimated effort:** ~1–2 sesje, 2 fazy.

## Open Risks & Assumptions

- Rozszerzenie `POST /api/flashcards` o `cards` w odpowiedzi musi zachować pole `saved` — inaczej regresja w S-01.
- Operacja PATCH/DELETE na cudzym/nieistniejącym `id` zwraca 0 wierszy → mapować na 404 (nie 200).

## Success Criteria (Summary)

- Użytkownik widzi, tworzy, edytuje i usuwa własne karty; każda zmiana trwa po reloadzie.
- Cudze karty są nieosiągalne (404 przez RLS) — brak cross-account leakage (NFR).
- Generowanie AI (S-01) działa bez regresji.
