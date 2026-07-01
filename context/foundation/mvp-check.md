# Raport z analizy projektu MVP — 10xCards

- **Data**: 2026-07-01
- **Projekt**: 10xCards — generator i menedżer fiszek z powtórkami rozłożonymi w czasie
- **Stack**: Astro 6 SSR + React 19 + Supabase + Cloudflare Workers
- **Kryteria**: 10xDevs — minimalne wymagania techniczne (blok 10xBuilder)

> Zakres: `astro-legacy-analysis/` (read-only klon `withastro/astro`) **nie jest** analizowanym MVP — to artefakt analizy do modułu kursu; pominięty. Pominięto też (zgodnie z regułami) projekt wizualny, styling, dostępność i fakt wdrożenia. Oceniono wyłącznie kod i dokumentację w repo.

## 1. Lista kontrolna

| # | Kryterium | Status |
|---|-----------|--------|
| 1 | Akcje CRUD | ✅ |
| 2 | Logika biznesowa | ✅ |
| 3 | Testy adresujące zdefiniowane ryzyko | ✅ |
| 4 | Uwierzytelnianie powiązane z użytkownikiem | ✅ |
| 5 | Dokumentacja | ✅ |

## 2. Status projektu

**5/5 → 100%** — wszystkie minimalne wymagania techniczne spełnione. Brak oczywistych luk.

## 3. Dowody per kryterium

### 1. Akcje CRUD ✅
Podstawowy element domeny: **fiszka** (`flashcards`), dane trwałe w Supabase. Wszystkie cztery operacje na trwałych danych:
- **Create** — `POST /api/flashcards` → `supabase.from("flashcards").insert(rows)` (`src/pages/api/flashcards/index.ts:54`)
- **Read** — lista SSR w `src/pages/flashcards.astro:20-28` (`.from("flashcards").select("id, front, back, created_at")`); dodatkowo `review.astro`, `GET /api/flashcards/due`
- **Update** — `PATCH /api/flashcards/[id]` → `.update({ front, back })` (`src/pages/api/flashcards/[id].ts:49`)
- **Delete** — `DELETE /api/flashcards/[id]` → `.delete().eq("id", …)` (`src/pages/api/flashcards/[id].ts:88`)

Trwałość potwierdzona testami integracyjnymi (patrz kryt. 3).

### 2. Logika biznesowa ✅
Dwie niezależne funkcje wykraczające poza CRUD:
- **Generowanie fiszek przez LLM z łańcuchem fallbacku modeli** — `src/pages/api/flashcards/generate.ts` iteruje `MODEL_CHAIN` (`src/lib/ai.ts:12`, model domyślny + zapasowy), woła `ai.chat.completions.create`, parsuje odpowiedź jako JSON i waliduje zod-em (`generate.ts:2,30-41,61`). Rdzeń unikalnej wartości produktu.
- **Harmonogram powtórek (spaced repetition, FSRS)** — `src/lib/srs.ts:56` `review(row, rating, now)` używa `ts-fsrs` (`scheduler.next(...)`) do wyliczenia następnego terminu; `POST /api/flashcards/[id]/review` utrwala nowy harmonogram. Realny algorytm planowania.

### 3. Testy adresujące zdefiniowane ryzyko ✅
Plan testów: `context/foundation/test-plan.md` z jawną **Mapą Ryzyka** (6 scenariuszy awarii, sekcja „2. Risk Map"). Testy mapują się na ryzyka:
- **Ryzyko #2** (karta „zapisana", ale nie przetrwa reloadu) → `tests/integration/flashcards/create.integration.test.ts`, `edit.integration.test.ts`
- **Ryzyko #6** (SRS gubi/źle planuje postęp) → `tests/integration/flashcards/review.integration.test.ts`, `due.integration.test.ts`
- **Ryzyko #1** (zepsuta odpowiedź LLM łamie generowanie) → `tests/pages/api/flashcards/generate.test.ts`, `tests/components/flashcards/FlashcardGenerator.test.tsx`
- **Ryzyko #3** (IDOR/RLS — cudze karty) → `edit.integration.test.ts:66`, `review.integration.test.ts:94` („returns 404 when … a card the user does not own (RLS)")

Rzeczywiste testy odpowiadają zadeklarowanym ryzykom. Dwuwarstwowa strategia unit + integration + e2e.

### 4. Uwierzytelnianie powiązane z użytkownikiem ✅
- Logowanie/rejestracja: `src/pages/api/auth/{signin,signup,signout}.ts`; klient SSR cookie-based `@supabase/ssr` (`src/lib/supabase.ts:1`)
- Bramkowanie: `src/middleware.ts:4` `PROTECTED_ROUTES = ["/dashboard","/generate","/flashcards","/review","/account"]`, `getUser()` (`middleware.ts:12`), przekierowanie niezalogowanych
- Własność zasobów per użytkownik: `flashcards.user_id → auth.users(id)` (`supabase/migrations/20260528000000_create_flashcards.sql:4`), RLS włączone (`:25`), polityki view/insert/update/delete **own** na `auth.uid() = user_id` (`:27-46`)

### 5. Dokumentacja ✅
Pełny fundament 10x w `context/foundation/`: `prd.md` (152 linie — Vision & Problem, Persona, Success Criteria, User Stories, Functional/Non-Functional Requirements, Business Logic, Access Control, Non-Goals), a także `shape-notes.md`, `roadmap.md`, `tech-stack.md`, `test-plan.md`, `infrastructure.md`, `production-state.md`. `README.md` obecny (uzupełniony o opis produktu). PRD to realna treść, nie wypełniacz.

## 4. Priorytetowe ulepszenia

Brak niespełnionych kryteriów — nie ma obowiązkowych poprawek do przekroczenia progu technicznego. Porządki wykonane / opcjonalne:
1. ~~Usunięcie endpointów-śmieci z ćwiczeń (`src/pages/api/lesson4*.ts`, 10 plików)~~ — **zrobione 2026-07-01**.
2. ~~`README.md` był generycznym szablonem startera~~ — **uzupełniony** o opis 10xCards + wskaźnik do `context/foundation/prd.md`.
3. `test-results.txt` w katalogu głównym to artefakt uruchomienia — do usunięcia / dopisania do `.gitignore` (obecnie ignorowany tylko katalog `test-results/`). *(usuwa użytkownik ręcznie)*

## 5. Wyróżnienie

Projekt wyraźnie wykracza poza minimum: integracja LLM z łańcuchem fallbacku modeli, algorytm SRS (`ts-fsrs`), warstwowa strategia testów zakotwiczona w mapie ryzyka (unit + integration + e2e), testy izolacji między kontami (RLS/IDOR) oraz ścieżka usuwania konta zgodna z RODO (art. 17, `src/pages/api/account/delete.ts`, Ryzyko #5). Profil kandydata do specjalnego wyróżnienia / Demo Day — warto podkreślić te elementy w zgłoszeniu.
