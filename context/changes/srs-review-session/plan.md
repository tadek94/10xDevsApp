# S-03: Sesja powtórek SRS — Implementation Plan

## Overview

Implementacja slice **S-03** (north star, część końcowa): zalogowany użytkownik uruchamia sesję spaced repetition na zapisanych fiszkach. Aplikacja pobiera karty wymagalne (`srs_due ≤ teraz`) w kolejności wyznaczonej przez algorytm FSRS, użytkownik ocenia każdą kartę (Again/Hard/Good/Easy), a wynik jest natychmiast zapisywany, więc harmonogram przeżywa reload i przenosi się do następnej sesji. Biblioteka SRS: `ts-fsrs` (rozstrzygnięte w `external-research.md`, zgodność potwierdzona w `research.md`). PRD: FR-009, FR-010, NFR (izolacja kont).

## Current State Analysis

- **Tabela `flashcards`** (`supabase/migrations/20260528000000_create_flashcards.sql:2-9`) zawiera tylko `id, user_id, front, back, created_at, updated_at` — **zero pól SRS**. RLS per-operacja dla roli `authenticated` (`:27-46`), GRANT w osobnej migracji (`20260601000000_grant_flashcards_permissions.sql:1`). Trigger auto-`updated_at` (`:12-23`).
- **Typy** (`src/types.ts:1-12`) ręcznie pisane: `Flashcard` + `FlashcardInsert`/`FlashcardUpdate`. Timestampy jako `string` (ISO). Brak generacji z CLI → typy aktualizujemy ręcznie.
- **Wzorzec tras API** (`src/pages/api/flashcards/index.ts`, `[id].ts`): `prerender = false` → walidacja zod → `createClient(headers, cookies)` → `await supabase.auth.getSession()` (hydracja JWT pod RLS) → mutacja z `.select(...)` zwracającym **pełny rekord** → obsługa 401 (brak usera) / 400 (zła walidacja) / 404 (pusty wynik = brak lub cudzy wiersz) / 500.
- **Auth**: middleware (`src/middleware.ts`) waliduje `getUser()` raz i ustawia `context.locals.user`; trasy czytają `context.locals.user`. `PROTECTED_ROUTES = ["/dashboard", "/generate", "/flashcards"]` (`:4`).
- **Wzorzec strony + wyspa**: `flashcards.astro:13-23` robi SSR-fetch (z `getSession()`), przekazuje `initialCards` do wyspy React `client:load` (`:42`). Wyspa `FlashcardCollection.tsx` używa `useState` (brak katalogu `src/components/hooks/`), `fetch` do API, 401 → redirect na `/auth/signin`.
- **Integracja biblioteki 3rd-party**: `src/lib/ai.ts:1-9` importuje `openai` bezpośrednio, bez specjalnej obsługi vite/wrangler — precedens dla `ts-fsrs`.
- **Reguła dat** (CLAUDE.md:19-22): zawsze UTC, zawsze `formatDate()` (`src/lib/utils.ts:8-10`, wrapper na `toISOString()`), nie używać surowego `new Date().toISOString()`.

## Desired End State

Zalogowany użytkownik wchodzi na `/review`, widzi karty wymagalne pojedynczo, odsłania odpowiedź, ocenia ją jednym z 4 przycisków FSRS; ocena natychmiast aktualizuje stan SRS karty w bazie i przesuwa `srs_due` w przyszłość zgodnie z FSRS. Po ostatniej karcie widzi ekran podsumowania. Gdy brak kart wymagalnych — stan pusty z linkami do generowania/kolekcji. Gdy talia mała (< 3 wymagalnych) — notka informacyjna, ale sesja startuje. Wynik każdej oceny przeżywa reload strony (guardrail PRD). Karty innego konta są niedostępne pod każdą ścieżką (NFR).

### Key Discoveries:

- Pola `createEmptyCard()` z ts-fsrs (stability=0, difficulty=0, reps=0, lapses=0, elapsed_days=0, scheduled_days=0, state=0/New, due=now, last_review=undefined) **dokładnie pokrywają się z defaultami kolumn** — backfill istniejących kart przez `NOT NULL DEFAULT` daje poprawny stan "nowej karty FSRS" (`research.md` Wymiar 1).
- Istniejący GRANT na poziomie tabeli **obejmuje nowe kolumny** — nie trzeba ponawiać GRANT; RLS filtruje po `user_id`, nie po kolumnach → **żadnych nowych polityk** (`research.md` szkic A).
- Granica `Date ↔ ISO` musi być scentralizowana w `src/lib/srs.ts` — obiekty `Date` nie wyciekają do tras, stanu React ani propsów (`research.md` Architecture Insights).
- `ts-fsrs` jest pure-ESM/zero-dep → bundluje się do workera bez zmian configu; **nie** instalować optymalizatora `@open-spaced-repetition/binding` (Rust/WASI) (`external-research.md:31`).

## What We're NOT Doing

- **Podgląd następnego interwału na przyciskach ocen** (np. "Good → 3d") — wymagałby `ts-fsrs` po stronie klienta i obsługi `Date` w wyspie; odroczone, przyciski mają statyczne etykiety.
- **Nowe komponenty shadcn** (`card`, `dialog`) — UI sesji mirroruje istniejący wzorzec stylowanych `div` z `FlashcardItem`/`FlashcardCollection` (Tailwind), reużywa `Button`. Sesja jest pełnostronową wyspą, nie modalem.
- **Twarde minimum talii / blokada startu** — wybrano notkę bez blokady (FR-009).
- **Wersjonowanie parametrów FSRS** w schemacie — używamy domyślnych wag `fsrs()`; ewentualne wersjonowanie to v2.
- **Historia powtórek / ReviewLog** — zapisujemy tylko bieżący stan karty (`result.card`), nie log (`result.log`). Tabela historii poza zakresem MVP.
- **Nauka z wyprzedzeniem (learn-ahead)** gdy nic nie jest wymagalne — stan pusty zamiast wymuszania kart z przyszłości.

## Implementation Approach

Czterofazowo, od danych do UI, każda faza weryfikowalna `npm run lint` + `npm run build` (brak test runnera — to są kroki weryfikacji wg CLAUDE.md). Migracja SRS rozszerza istniejącą tabelę `flashcards` (nie tworzy nowej), więc nie wymaga nowych RLS/GRANT. Cała logika FSRS i konwersja dat żyją w jednym module serwisowym `src/lib/srs.ts`; trasy API i UI mirrorują istniejące wzorce flashcards 1:1.

## Critical Implementation Details

- **Hydratacja Card odporna na wersję biblioteki**: `toCard(row)` w `src/lib/srs.ts` musi budować obiekt `Card` startując od `createEmptyCard()` i nadpisując nim utrwalone pola — a nie konstruować `Card` ręcznie z 9 pól. ts-fsrs 5.x dodał pola (np. `learning_steps`); start od `createEmptyCard()` daje im rozsądne defaulty i chroni przed `undefined` w `scheduler.next()`. Konsekwencja: intra-day learning-steps nie są utrwalane w MVP (akceptowalne — patrz Open Risks).
- **Reguła dat na każdej granicy**: zapis `srs_due`/`srs_last_review` przez `formatDate(card.due)` (nie surowy `toISOString()`); filtr "due" w zapytaniach też przez `formatDate(new Date())`. `Date` nigdy nie trafia do propsów wyspy.

## Phase 1: Migracja SRS + typy

### Overview
Rozszerzyć `flashcards` o 9 kolumn SRS z defaultami (backfill istniejących wierszy), dodać indeks pod zapytanie "due", zaktualizować `src/types.ts`.

### Changes Required:

#### 1. Migracja SRS
**File**: `supabase/migrations/<YYYYMMDDHHmmss>_add_srs_fields.sql` (nowy, naming wg CLAUDE.md:12)

**Intent**: Dodać kolumny stanu FSRS do `flashcards` tak, by istniejące karty stały się natychmiast wymagalnymi "nowymi" kartami; dodać indeks przyspieszający selekcję wymagalnych kart per użytkownik.

**Contract**: `ALTER TABLE flashcards ADD COLUMN` dla:
- `srs_due TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())`
- `srs_stability DOUBLE PRECISION NOT NULL DEFAULT 0`
- `srs_difficulty DOUBLE PRECISION NOT NULL DEFAULT 0`
- `srs_elapsed_days INTEGER NOT NULL DEFAULT 0`
- `srs_scheduled_days INTEGER NOT NULL DEFAULT 0`
- `srs_reps INTEGER NOT NULL DEFAULT 0`
- `srs_lapses INTEGER NOT NULL DEFAULT 0`
- `srs_state SMALLINT NOT NULL DEFAULT 0 CHECK (srs_state BETWEEN 0 AND 3)`
- `srs_last_review TIMESTAMPTZ` (nullable)

Plus: `CREATE INDEX idx_flashcards_user_due ON flashcards (user_id, srs_due);`. **Bez** nowych polityk RLS i **bez** GRANT (istniejące obejmują nowe kolumny — zweryfikować komentarzem w migracji).

#### 2. Typy SRS
**File**: `src/types.ts`

**Intent**: Odzwierciedlić nowe kolumny w typie wiersza i dodać typy pomocnicze dla sesji.

**Contract**: Rozszerzyć `Flashcard` o pola `srs_due: string`, `srs_stability: number`, `srs_difficulty: number`, `srs_elapsed_days: number`, `srs_scheduled_days: number`, `srs_reps: number`, `srs_lapses: number`, `srs_state: number`, `srs_last_review: string | null`. Dodać `export type ReviewRating = "again" | "hard" | "good" | "easy";` oraz `export type ReviewCard = Pick<Flashcard, "id" | "front" | "back">` (kontrakt wysyłany do wyspy — bez pól SRS, bez `Date`).

### Success Criteria:

#### Automated Verification:
- [ ] Migracja aplikuje się czysto: `npx supabase db reset` (wymaga lokalnego Supabase)
- [ ] Lint przechodzi: `npm run lint`
- [ ] Build przechodzi: `npm run build`

#### Manual Verification:
- [ ] W Supabase Studio tabela `flashcards` ma 9 nowych kolumn z poprawnymi defaultami i CHECK na `srs_state`
- [ ] Istniejące karty (jeśli są) mają `srs_state=0` i `srs_due ≈ now` po migracji

**Implementation Note**: Po przejściu automatycznej weryfikacji wstrzymaj się na potwierdzenie ręcznej weryfikacji przed Fazą 2.

---

## Phase 2: Serwis SRS (`src/lib/srs.ts`)

### Overview
Zainstalować `ts-fsrs`, stworzyć funkcyjny moduł będący jedynym właścicielem logiki FSRS i konwersji `Date ↔ ISO`.

### Changes Required:

#### 1. Zależność
**File**: `package.json`

**Intent**: Dodać `ts-fsrs` do `dependencies`. NIE dodawać optymalizatora `@open-spaced-repetition/binding`.

**Contract**: `npm install ts-fsrs` → wpis w `dependencies`; `npm install` bez błędów.

#### 2. Moduł serwisowy
**File**: `src/lib/srs.ts` (nowy)

**Intent**: Wyeksportować scheduler FSRS oraz funkcje mapujące wiersz Supabase ↔ ts-fsrs `Card` i wyliczające nowy stan po ocenie. Centralizuje granicę dat (używa `formatDate` z `@/lib/utils`).

**Contract**:
- `scheduler = fsrs()` (domyślne wagi).
- `RATING_MAP: Record<ReviewRating, Rating>` → `{ again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy }`.
- `toCard(row: SrsState): Card` — buduje Card **startując od `createEmptyCard()`** i nadpisując utrwalone pola; `srs_due`/`srs_last_review` (stringi ISO) → `new Date(...)`, `srs_last_review` null → `undefined`. (Patrz Critical Implementation Details — odporność na wersję biblioteki; uzasadnia jedyny snippet w planie.)
- `fromCard(card: Card): SrsState` — zwraca obiekt kolumn `srs_*` do `UPDATE`; daty przez `formatDate(card.due)` / `card.last_review ? formatDate(card.last_review) : null`.
- `review(row: SrsState, rating: ReviewRating, now: Date): SrsState` — `scheduler.next(toCard(row), now, RATING_MAP[rating]).card` → `fromCard(...)`.
- `SrsState` to typ obejmujący 9 pól `srs_*` (alias/`Pick` z `Flashcard`).

Snippet (kontrakt `toCard`, bo nieoczywisty i load-bearing dla `next()`):
```typescript
function toCard(row: SrsState): Card {
  return {
    ...createEmptyCard(),
    due: new Date(row.srs_due),
    stability: row.srs_stability,
    difficulty: row.srs_difficulty,
    elapsed_days: row.srs_elapsed_days,
    scheduled_days: row.srs_scheduled_days,
    reps: row.srs_reps,
    lapses: row.srs_lapses,
    state: row.srs_state,
    last_review: row.srs_last_review ? new Date(row.srs_last_review) : undefined,
  };
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `ts-fsrs` w `dependencies`; `npm install` czysty
- [ ] Lint przechodzi: `npm run lint`
- [ ] Build przechodzi: `npm run build` (potwierdza brak frykcji ESM/workerd)

#### Manual Verification:
- [ ] Inspekcja kodu: `fromCard` nie używa surowego `toISOString()` — wyłącznie `formatDate()`; `Date` nie wycieka poza moduł

**Implementation Note**: Po automatycznej weryfikacji wstrzymaj się na potwierdzenie przed Fazą 3.

---

## Phase 3: Trasy API (due + review)

### Overview
Dwystawić pobranie kart wymagalnych oraz zapis oceny pojedynczej karty, mirrorując wzorzec `getSession()` + zwrot pełnego rekordu.

### Changes Required:

#### 1. Endpoint kart wymagalnych
**File**: `src/pages/api/flashcards/due.ts` (nowy)

**Intent**: Zwrócić karty użytkownika wymagalne teraz, w kolejności FSRS (rosnąco po `srs_due`), jako lekki kontrakt `ReviewCard` (bez pól SRS).

**Contract**: `GET`, `prerender = false`. 401 gdy brak `context.locals.user`. `createClient` → `getSession()` → `.from("flashcards").select("id, front, back").lte("srs_due", formatDate(new Date())).order("srs_due", { ascending: true })`. Zwraca `{ cards: ReviewCard[] }`. Filtr czasu przez `formatDate(new Date())` (reguła dat).

#### 2. Endpoint oceny
**File**: `src/pages/api/flashcards/[id]/review.ts` (nowy, zagnieżdżony katalog `[id]/`)

**Intent**: Przyjąć ocenę, wyliczyć nowy stan FSRS i utrwalić go natychmiast (per-karta), zwracając pełny rekord.

**Contract**: `POST`, `prerender = false`. Walidacja: `id` jako `z.uuid()` (jak `[id].ts:7`), body `z.object({ rating: z.enum(["again","hard","good","easy"]) })`. 401/400 jak w istniejących trasach. `getSession()` → SELECT pól `srs_*` karty (`.eq("id", id).select("srs_due, srs_stability, srs_difficulty, srs_elapsed_days, srs_scheduled_days, srs_reps, srs_lapses, srs_state, srs_last_review")`); pusty wynik → 404 (brak lub cudza karta, RLS). → `srs.review(row, rating, new Date())` → `.update({ ...srsUpdate }).eq("id", id).select("id, front, back, srs_due")`. Zwraca `{ card }`. 404 gdy UPDATE zwróci pusto.

### Success Criteria:

#### Automated Verification:
- [ ] Lint przechodzi: `npm run lint`
- [ ] Build przechodzi: `npm run build`

#### Manual Verification:
- [ ] `GET /api/flashcards/due` (zalogowany) zwraca tylko karty `srs_due ≤ now`, posortowane rosnąco po `srs_due`
- [ ] `POST /api/flashcards/{id}/review` z `{rating:"good"}` przesuwa `srs_due` w przyszłość, zwraca pełną kartę; zmiana widoczna po reload
- [ ] Nieprawidłowy `rating` → 400; nieznane `id` → 404; brak sesji → 401
- [ ] NFR: `id` karty innego konta → 404 (brak wycieku między kontami)

**Implementation Note**: Po automatycznej weryfikacji wstrzymaj się na potwierdzenie przed Fazą 4.

---

## Phase 4: UI sesji powtórek

### Overview
Strona `/review` (SSR-fetch wymagalnych) + wyspa `ReviewSession` (flip, 4 oceny, per-karta POST, postęp, stany brzegowe), ochrona trasy i linki wejścia.

### Changes Required:

#### 1. Ochrona trasy
**File**: `src/middleware.ts`

**Intent**: Wymusić logowanie na `/review`.

**Contract**: Dodać `"/review"` do `PROTECTED_ROUTES` (`:4`).

#### 2. Strona sesji
**File**: `src/pages/review.astro` (nowy)

**Intent**: SSR-pobrać karty wymagalne (mirror `flashcards.astro`) i zamontować wyspę.

**Contract**: `prerender = false`. `createClient` → `getSession()` → `.select("id, front, back").lte("srs_due", formatDate(new Date())).order("srs_due", { ascending: true })`. Render `Layout` + nawigacja (jak `flashcards.astro:28-41`) + `<ReviewSession client:load initialCards={initialCards} />`. `initialCards: ReviewCard[]`.

#### 3. Wyspa sesji
**File**: `src/components/flashcards/ReviewSession.tsx` (nowy)

**Intent**: Prowadzić użytkownika karta-po-karcie: odsłonięcie odpowiedzi, 4 oceny, natychmiastowy POST oceny, postęp i stany brzegowe. Mirror konwencji `FlashcardCollection.tsx` (useState inline, 401 → `redirectToSignin`, stylowane `div` Tailwind, `Button`).

**Contract**: Props `{ initialCards: ReviewCard[] }`. Stan: `queue` (kopia initialCards), `index`, `revealed`, `isSubmitting`, `error`. Render:
- **Stan pusty** (`initialCards.length === 0`): komunikat "Brak kart do powtórki" + linki do `/generate` i `/flashcards`.
- **Notka małej talii** (`initialCards.length < 3`): baner informacyjny, sesja działa normalnie.
- **Karta**: front; przycisk "Pokaż odpowiedź" → `revealed`; po odsłonięciu back + 4 przyciski (Again/Hard/Good/Easy, etykiety PL). Klik oceny → `POST /api/flashcards/{id}/review {rating}`; 401 → redirect; sukces → `index++`, `revealed=false`; błąd → komunikat, bez przejścia.
- **Postęp**: licznik `index+1 / queue.length`.
- **Ekran końcowy** (`index >= queue.length`): "Sesja zakończona — przejrzano N kart" + link do `/dashboard` lub `/flashcards`.

#### 4. Linki wejścia
**File**: `src/pages/dashboard.astro`, `src/pages/flashcards.astro`

**Intent**: Udostępnić wejście do sesji z dashboardu i kolekcji.

**Contract**: Dodać link/przycisk `→ /review` ("Sesja powtórek") spójny ze stylem istniejącej nawigacji (`flashcards.astro:28-41`).

### Success Criteria:

#### Automated Verification:
- [ ] Lint przechodzi: `npm run lint`
- [ ] Build przechodzi: `npm run build`

#### Manual Verification:
- [ ] `/review` przekierowuje na `/auth/signin` gdy wylogowany; ładuje się dla zalogowanego
- [ ] Odsłonięcie odpowiedzi działa; 4 przyciski oceniają i przechodzą dalej; licznik postępu poprawny
- [ ] Wynik per-karta utrwalony: ocenić kartę, zrobić reload w trakcie sesji — oceniona karta nie jest już wymagalna
- [ ] Stan pusty gdy brak wymagalnych; notka małej talii (< 3) widoczna, ale sesja startuje
- [ ] Ekran końcowy po ostatniej karcie
- [ ] Linki z dashboardu i kolekcji prowadzą do `/review`

**Implementation Note**: Po automatycznej weryfikacji wstrzymaj się na potwierdzenie pełnego flow north-star (S-01 → S-03) przed zamknięciem.

---

## Testing Strategy

### Unit Tests:
Brak test runnera (CLAUDE.md). Weryfikacja przez `npm run lint` (ESLint type-checked) + `npm run build`. Logika czysta `src/lib/srs.ts` (toCard/fromCard/review) jest najlepszym kandydatem na przyszłe testy, gdy runner zostanie dodany.

### Integration Tests:
Manualne, przez UI i curl/Network (sekcje Manual Verification powyżej).

### Manual Testing Steps:
1. Zaloguj się, wygeneruj/dodaj ≥ 3 karty (S-01/S-02).
2. Wejdź na `/review` — wszystkie nowe karty wymagalne (`srs_due=now`).
3. Odsłoń odpowiedź, oceń "Good" — karta znika z bieżącej sesji.
4. Reload w trakcie sesji — oceniona karta nie wraca; nieoceniony ogon zostaje.
5. Dokończ sesję — ekran końcowy z liczbą przejrzanych kart.
6. Wejdź ponownie na `/review` tego samego dnia — stan pusty (nic nie jest już wymagalne).
7. Wyloguj się, wejdź na `/review` — redirect na signin.
8. (NFR) Z konta B spróbuj `POST /api/flashcards/{id konta A}/review` — 404.

## Performance Considerations

Arytmetyka FSRS < 1 ms/kartę, bezpieczna w limicie CPU workerd (50ms free / 30s paid). Zapytanie "due" pokryte indeksem `(user_id, srs_due)`. Per-karta POST oznacza N zapytań na sesję — przy małych taliach MVP bez znaczenia.

## Migration Notes

Migracja tylko dodaje kolumny + indeks do istniejącej tabeli; istniejące wiersze dostają defaulty (backfill bez osobnego UPDATE). Rollback: `DROP` dodanych kolumn + indeksu (dane SRS bezpowrotnie znikają — akceptowalne, bo to stan pochodny, nie treść). Brak zmian RLS/GRANT do cofnięcia.

## References

- Research (zgodność + szkic): `context/changes/srs-review-session/research.md`
- API docs ts-fsrs (Context7): `context/changes/srs-review-session/ts-fsrs-api-docs.md`
- Wybór biblioteki: `context/changes/srs-review-session/external-research.md`
- Wzorzec trasy mutującej: `src/pages/api/flashcards/[id].ts:14-66`
- Wzorzec strony + wyspa: `src/pages/flashcards.astro:13-42`, `src/components/flashcards/FlashcardCollection.tsx`
- Lekcje: `context/foundation/lessons.md` (GRANT `:14-19`, getSession `:28-33`, zwrot pełnego rekordu `:36-40`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migracja SRS + typy

#### Automated
- [x] 1.1 Migracja aplikuje się czysto: `npx supabase db push` (cloud) — ed3bc49
- [x] 1.2 Lint przechodzi: `npm run lint` — ed3bc49
- [x] 1.3 Build przechodzi: `npm run build` — ed3bc49

#### Manual
- [x] 1.4 Tabela `flashcards` ma 9 nowych kolumn z defaultami i CHECK na `srs_state` — ed3bc49
- [x] 1.5 Istniejące karty mają `srs_state=0` i `srs_due ≈ now` — ed3bc49

### Phase 2: Serwis SRS

#### Automated
- [x] 2.1 `ts-fsrs` w `dependencies`; `npm install` czysty — 54a4d37
- [x] 2.2 Lint przechodzi: `npm run lint` — 54a4d37
- [x] 2.3 Build przechodzi: `npm run build` — 54a4d37

#### Manual
- [x] 2.4 `fromCard` używa wyłącznie `formatDate()`; `Date` nie wycieka poza moduł — 54a4d37

### Phase 3: Trasy API (due + review)

#### Automated
- [x] 3.1 Lint przechodzi: `npm run lint` — db3cf1b
- [x] 3.2 Build przechodzi: `npm run build` — db3cf1b

#### Manual
- [x] 3.3 `GET /api/flashcards/due` zwraca tylko wymagalne, sort rosnąco po `srs_due` — db3cf1b
- [x] 3.4 `POST .../review` przesuwa `srs_due` w przyszłość, zwraca pełną kartę, przeżywa reload — db3cf1b
- [ ] 3.5 Zła ocena → 400; nieznane id → 404; brak sesji → 401
- [ ] 3.6 NFR: karta innego konta → 404

### Phase 4: UI sesji powtórek

#### Automated
- [x] 4.1 Lint przechodzi: `npm run lint`
- [x] 4.2 Build przechodzi: `npm run build`

#### Manual
- [x] 4.3 `/review` chroniona (redirect signin), ładuje się dla zalogowanego
- [x] 4.4 Flip + 4 oceny działają, licznik postępu poprawny
- [x] 4.5 Wynik per-karta przeżywa reload w trakcie sesji
- [x] 4.6 Stan pusty gdy brak wymagalnych; notka małej talii (< 3) widoczna, sesja startuje
- [x] 4.7 Ekran końcowy po ostatniej karcie
- [x] 4.8 Linki z dashboardu i kolekcji prowadzą do `/review`
