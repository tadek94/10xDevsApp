# Kolekcja fiszek (S-02) Implementation Plan

## Overview

Dostarcza zarządzanie kolekcją fiszek (FR-005–008): widok płaskiej listy zapisanych kart, ręczne tworzenie karty (front + back), edycja dowolnej karty oraz usuwanie z potwierdzeniem. Cała funkcjonalność stoi na istniejącym schemacie `flashcards` (F-01) — bez nowych migracji.

## Current State Analysis

- **Schemat gotowy** — `supabase/migrations/20260528000000_create_flashcards.sql` tworzy tabelę `flashcards` z kompletem polityk RLS dla `authenticated`: SELECT/INSERT/**UPDATE**/**DELETE**, wszystkie `auth.uid() = user_id`, plus trigger auto-aktualizujący `updated_at`. Migracja `20260601000000_grant_flashcards_permissions.sql` dodaje wymagane GRANT-y. Pełny CRUD jest już dozwolony na poziomie bazy.
- **Typy gotowe** — `src/types.ts` eksportuje `Flashcard`, `FlashcardInsert` (`front|back`), `FlashcardUpdate` (`Partial<front|back>`).
- **Endpoint zapisu istnieje** — `src/pages/api/flashcards/index.ts` ma `POST` (batch save 1–15 kart): wzorzec zod `safeParse` → `createClient(headers, cookies)` → `await supabase.auth.getSession()` (hydratacja JWT pod RLS) → `insert(...).select(...)`. Ręczne tworzenie pojedynczej karty mieści się w tym kontrakcie (`cards: [{front, back}]`).
- **Brak** — endpointu edycji/usuwania pojedynczej karty, widoku kolekcji, route'u `/flashcards`.
- **Wzorce UI** — `FlashcardGenerator.tsx` (React-island: `fetch`, obsługa 401 → redirect na `/auth/signin`, stany `error`/`success`/`isSaving`); `CardReviewItem.tsx` zawiera `EditForm` (lokalny stan front/back, walidacja `.trim()`, „Zapisz edycję"/„Anuluj") — wzorzec do reużycia przy edycji zapisanej karty. Paleta „cosmic" (`bg-white/10`, `backdrop-blur`, `text-blue-100/*`).
- **Auth/ochrona** — `src/middleware.ts`: `PROTECTED_ROUTES = ["/dashboard", "/generate"]`, redukcja na `/auth/signin` dla niezalogowanych; `context.locals.user` dostępny w stronach Astro i endpointach.
- **Lekcje** (`context/foundation/lessons.md`) — (1) każdy endpoint RLS musi wołać `getSession()` przed zapytaniem; (2) tabele wymagają jawnych GRANT-ów (już spełnione dla `flashcards`).

## Desired End State

Zalogowany użytkownik wchodzi na `/flashcards`, widzi swoje karty jako płaską listę posortowaną od najnowszej. Może: rozwinąć formularz „Dodaj kartę" i zapisać nową; kliknąć „Edytuj" przy karcie, zmienić front/back i zapisać; kliknąć „Usuń" → potwierdzić („Na pewno? Tak/Anuluj") → karta znika. Każda operacja przeżywa przeładowanie strony (lista jest SSR-owana z bazy przy każdym żądaniu). Niezalogowany użytkownik trafiający na `/flashcards` jest przekierowany na `/auth/signin`.

### Key Discoveries:

- Pełny CRUD już dozwolony przez RLS — `20260528000000_create_flashcards.sql:37-46` (UPDATE + DELETE policy). Brak potrzeby migracji.
- Hydratacja sesji obowiązkowa w endpointach RLS — `src/pages/api/flashcards/index.ts:46` i `lessons.md` (reguła F8).
- Wzorzec inline-edit gotowy do reużycia — `src/components/flashcards/CardReviewItem.tsx:29-73` (`EditForm`).
- SSR-owanie listy z `locals.user` w stronie Astro naturalnie spełnia guardrail „zmiany przeżywają reload" (PRD §Guardrails).

## What We're NOT Doing

- Brak nowych migracji ani zmian schematu (SRS-owe pola należą do S-03).
- Brak paginacji/wyszukiwania/sortowania konfigurowalnego — `target_scale.data_volume: small`; płaska lista posortowana `created_at DESC`.
- Brak soft-delete / kosza (PRD: rozważyć w v2). Usuwanie jest twarde, chronione potwierdzeniem.
- Brak edycji wsadowej i zaznaczania wielu kart.
- Brak komponentu shadcn Dialog — potwierdzenie usuwania jest inline.
- Brak osobnego endpointu GET listy (lista pochodzi z SSR) ani osobnego route'u tworzenia.

## Implementation Approach

Dwie fazy. Faza 1 domyka warstwę API jednym dynamicznym route'em `[id].ts` (PATCH + DELETE) — tworzenie reużywa istniejącego `POST /api/flashcards`. Faza 2 buduje widok: SSR-owana strona `/flashcards.astro` przekazuje początkową listę do React-island `FlashcardCollection`, który obsługuje tworzenie, edycję i usuwanie przez `fetch`, aktualizując stan lokalny optymistycznie po sukcesie odpowiedzi. Wszystkie endpointy trzymają się wzorca z `index.ts`: zod → `getSession()` → operacja Supabase pod RLS.

## Critical Implementation Details

- **Hydratacja sesji** — `[id].ts` (PATCH i DELETE) MUSI wywołać `await supabase.auth.getSession()` przed zapytaniem, inaczej RLS `USING (auth.uid() = user_id)` odrzuci wiersz (anon key, `auth.uid()=null`). To powtarzalna reguła z `lessons.md`.
- **Izolacja kont przez RLS, nie przez kod** — PATCH/DELETE filtrują po `id`; ochrona przed dostępem do cudzej karty pochodzi z polityki RLS (`auth.uid() = user_id`). Operacja na nieistniejącym/cudzym `id` zwróci 0 zmienionych wierszy — należy to zmapować na 404, nie 200.

## Phase 1: Warstwa API — edycja i usuwanie pojedynczej karty

### Overview

Nowy dynamiczny endpoint `src/pages/api/flashcards/[id].ts` z handlerami `PATCH` (edycja front/back) i `DELETE` (usunięcie), zgodny ze wzorcem `index.ts`.

### Changes Required:

#### 1. Dynamiczny route fiszki

**File**: `src/pages/api/flashcards/[id].ts` (nowy)

**Intent**: Udostępnić edycję i usunięcie pojedynczej karty zalogowanego użytkownika, z walidacją wejścia i ochroną RLS. Reużyć wzorzec auth/hydratacji/błędów z `index.ts`.

**Contract**:

- `export const prerender = false;`
- Oba handlery: jeśli `!context.locals.user` → `401 {error:"Unauthorized"}`. Pobranie `id` z `context.params.id`; walidacja zod, że to UUID → w razie błędu `400`.
- `createClient(context.request.headers, context.cookies)`; jeśli `null` → `500 {error:"Database not configured"}`. Następnie **`await supabase.auth.getSession()`** przed zapytaniem.
- `PATCH`: body parsowane zod schematem `{ front: string.trim().min(1), back: string.trim().min(1) }` (oba wymagane — edycja zastępuje obie strony; kształt zgodny z `FlashcardUpdate`, ale wymuszamy komplet). Zapytanie: `update({front, back}).eq("id", id).select("id")`. Gdy zwrócona tablica pusta → `404 {error:"Not found"}` (karta nie istnieje lub należy do innego użytkownika — odfiltrowana przez RLS). Sukces → `Response.json({ id })`.
- `DELETE`: `delete().eq("id", id).select("id")`. Pusta tablica → `404`. Sukces → `Response.json({ deleted: id })`.
- Błędy Supabase: `console.error(error)` + `500 {error:"..."}` (jak w `index.ts:56-60`).

### Success Criteria:

#### Automated Verification:

- Type checking przechodzi: `npm run build`
- Linting przechodzi: `npm run lint`

#### Manual Verification:

- `PATCH /api/flashcards/<own-id>` z poprawnym body zmienia kartę i zwraca `{id}`; po reloadzie kolekcji zmiana jest widoczna.
- `DELETE /api/flashcards/<own-id>` usuwa kartę i zwraca `{deleted}`.
- `PATCH`/`DELETE` z cudzym lub nieistniejącym `id` zwraca `404` (nie modyfikuje danych) — weryfikacja izolacji kont (NFR).
- Niezalogowane żądanie zwraca `401`.
- Body bez `front`/`back` lub z pustym stringiem zwraca `400`.

**Implementation Note**: Po ukończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przez człowieka, zanim przejdziesz do Fazy 2.

---

## Phase 2: Strona kolekcji + komponenty UI

### Overview

SSR-owana strona `/flashcards.astro` ładuje listę z bazy i przekazuje ją do React-island `FlashcardCollection`, który obsługuje tworzenie, edycję i usuwanie. Wpięcie route'u w ochronę i nawigację.

### Changes Required:

#### 1. Strona kolekcji (SSR)

**File**: `src/pages/flashcards.astro` (nowy)

**Intent**: Server-side pobrać karty zalogowanego użytkownika i wyrenderować je przez React-island; SSR przy każdym żądaniu gwarantuje świeżość po reloadzie (guardrail PRD).

**Contract**: W front-matter: `createClient(Astro.request.headers, Astro.cookies)` → `await supabase.auth.getSession()` → `from("flashcards").select("id, front, back, created_at").order("created_at", { ascending: false })`. Wynik (typu `Flashcard[]`, podzbiór pól) przekazany jako prop `initialCards` do `<FlashcardCollection client:load />`. Opakowanie w `Layout` + tło `bg-cosmic` (wzór `generate.astro`). Brak danych → island pokazuje empty-state.

#### 2. Komponent kolekcji (React-island)

**File**: `src/components/flashcards/FlashcardCollection.tsx` (nowy)

**Intent**: Zarządzać stanem listy w przeglądarce: render kart, formularz tworzenia, delegacja edycji/usuwania do `FlashcardItem`, komunikaty `error`/`success`. Po udanej operacji aktualizować stan lokalny (bez pełnego reloadu), zachowując spójność z bazą.

**Contract**:

- Props: `initialCards: { id: string; front: string; back: string; created_at: string }[]`.
- Stan: `cards` (zainicjowany `initialCards`), `error`, `success`, flagi zajętości.
- Tworzenie: przycisk „Dodaj kartę" rozwija formularz (front + back, wzór `EditForm`); zapis `POST /api/flashcards` z `{cards:[{front,back}]}`. Endpoint zwraca `{saved}` (liczbę), **nie** rekord — po sukcesie pobrać świeżą listę lub dołożyć kartę optymistycznie; **wybrana strategia**: po sukcesie tworzenia wykonać `window.location.reload()`-free odświeżenie przez ponowne SSR nie jest możliwe z wyspy, więc dołożyć zwróconą kartę. Aby mieć `id`/`created_at` nowej karty bez zgadywania, rozszerzyć `POST /api/flashcards` o zwracanie utworzonych rekordów (patrz zmiana #4).
- Edycja/usuwanie: renderować listę przez `FlashcardItem`, przekazując callbacki `onSaved(updated)` i `onDeleted(id)`, które aktualizują `cards`.
- Obsługa `401` z dowolnego `fetch` → `window.location.href = "/auth/signin"` (wzór `FlashcardGenerator.tsx:52`).
- Empty-state: gdy `cards.length === 0` — komunikat „Brak kart. Dodaj pierwszą lub wygeneruj na /generate" z linkiem.

#### 3. Komponent pojedynczej karty

**File**: `src/components/flashcards/FlashcardItem.tsx` (nowy)

**Intent**: Render jednej karty w trybie podglądu / edycji / potwierdzania usunięcia, z wywołaniami API i delegacją wyniku w górę.

**Contract**:

- Props: `card`, `onSaved(card)`, `onDeleted(id)`.
- Tryb podgląd: front (pogrubiony) + back + przyciski „Edytuj" i „Usuń" (wzór wizualny `CardReviewItem.tsx:89-113`).
- Tryb edycji: reużyć wzorzec `EditForm` (lokalny front/back, walidacja `.trim()`); „Zapisz edycję" → `PATCH /api/flashcards/{id}` → po sukcesie `onSaved`.
- Usuwanie dwustopniowe: klik „Usuń" przełącza lokalny stan `confirming` → render „Na pewno? Tak / Anuluj"; „Tak" → `DELETE /api/flashcards/{id}` → po sukcesie `onDeleted`; „Anuluj" → powrót do podglądu.
- Stany zajętości blokują przyciski podczas żądania.

#### 4. Rozszerzenie endpointu zapisu o zwrot rekordów

**File**: `src/pages/api/flashcards/index.ts`

**Intent**: Umożliwić wyspie dołożenie nowo utworzonej karty z prawdziwym `id`/`created_at` bez dodatkowego round-tripu, zamiast zgadywać.

**Contract**: Zmienić `.select("id")` na `.select("id, front, back, created_at")` i zwracać `Response.json({ saved: data.length, cards: data })`. Zachować wstecznie pole `saved` (używane przez `FlashcardGenerator.tsx:98`).

#### 5. Ochrona route'u i nawigacja

**File**: `src/middleware.ts`, `src/pages/dashboard.astro`, `src/pages/generate.astro`, `src/pages/flashcards.astro`

**Intent**: Wymusić auth na `/flashcards` i dać użytkownikowi wejścia do kolekcji oraz powrót z niej.

**Contract**:

- `middleware.ts`: dodać `"/flashcards"` do `PROTECTED_ROUTES`.
- `dashboard.astro`: dodać link „Moja kolekcja" → `/flashcards` (wzór istniejącego linku „Generuj fiszki", `dashboard.astro:18-23`).
- `generate.astro`: dodać link/powrót do `/flashcards` (po zapisaniu kart użytkownik trafia do kolekcji).
- `flashcards.astro`: górny pasek nawigacji z linkiem powrotnym „← Dashboard" i skrótem „Generuj fiszki" (addendum z przeglądu F2 — kolekcja nie może być ślepą uliczką).

### Success Criteria:

#### Automated Verification:

- Build przechodzi: `npm run build`
- Linting przechodzi: `npm run lint`
- Formatowanie: `npm run format`

#### Manual Verification:

- `/flashcards` jako zalogowany pokazuje wszystkie własne karty posortowane od najnowszej.
- Niezalogowany na `/flashcards` → redirect `/auth/signin`.
- „Dodaj kartę" zapisuje nową kartę; po reloadzie karta nadal jest (guardrail).
- „Edytuj" → zmiana front/back → zapis; po reloadzie zmiana trwa (guardrail § no silent data loss).
- „Usuń" → „Na pewno? Tak" usuwa kartę; „Anuluj" pozostawia ją bez zmian; po reloadzie stan zgodny.
- Pusta kolekcja pokazuje empty-state z linkiem do `/generate`.
- Linki z dashboardu i `/generate` prowadzą do `/flashcards`.
- Generowanie fiszek (S-01) nadal działa — `FlashcardGenerator` poprawnie czyta `saved` z rozszerzonej odpowiedzi (brak regresji).

**Implementation Note**: Po ukończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przez człowieka.

---

## Testing Strategy

> Brak skonfigurowanego test-runnera (CLAUDE.md) — weryfikacja przez `npm run build` + `npm run lint` i testy manualne.

### Manual Testing Steps:

1. Zaloguj się, wejdź na `/flashcards` — sprawdź listę (lub empty-state).
2. Dodaj kartę ręcznie → reload → karta obecna.
3. Edytuj kartę → reload → zmiana trwa.
4. Usuń kartę → potwierdź → reload → karta zniknęła; powtórz z „Anuluj" → karta zostaje.
5. Wyloguj się, wejdź na `/flashcards` → redirect na signin.
6. (Izolacja) Spróbuj `PATCH`/`DELETE` z `id` nienależącym do użytkownika → `404`, brak modyfikacji.
7. Wygeneruj i zapisz fiszki przez `/generate` → potwierdź brak regresji i że trafiają do `/flashcards`.

## Performance Considerations

`data_volume: small` — jedna kwerenda SELECT bez paginacji jest wystarczająca. SSR listy to jeden round-trip do Supabase na wejście; mieści się w budżecie CPU workerd (operacje DB, bez AI).

## Migration Notes

Brak. Schemat `flashcards` (F-01) już wspiera pełny CRUD i ma wymagane GRANT-y.

## References

- Wzorzec endpointu + hydratacja sesji: `src/pages/api/flashcards/index.ts`
- Wzorzec inline-edit: `src/components/flashcards/CardReviewItem.tsx:29-73`
- Wzorzec React-island + fetch/401: `src/components/flashcards/FlashcardGenerator.tsx`
- Schemat + RLS: `supabase/migrations/20260528000000_create_flashcards.sql`
- Reguły RLS/GRANT: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Warstwa API — edycja i usuwanie pojedynczej karty

#### Automated

- [x] 1.1 Type checking przechodzi: `npm run build` — 2e573b3
- [x] 1.2 Linting przechodzi: `npm run lint` — 2e573b3

#### Manual

- [x] 1.3 PATCH własnej karty zmienia ją i zwraca `{id}`; zmiana trwa po reloadzie — 2e573b3
- [x] 1.4 DELETE własnej karty usuwa ją i zwraca `{deleted}` — 2e573b3
- [x] 1.5 PATCH/DELETE z cudzym/nieistniejącym `id` → `404`, brak modyfikacji (izolacja kont) — 2e573b3
- [x] 1.6 Niezalogowane żądanie → `401` — 2e573b3
- [x] 1.7 Body bez `front`/`back` lub pusty string → `400` — 2e573b3

### Phase 2: Strona kolekcji + komponenty UI

#### Automated

- [x] 2.1 Build przechodzi: `npm run build` — 944ddde
- [x] 2.2 Linting przechodzi: `npm run lint` — 944ddde
- [x] 2.3 Formatowanie: `npm run format` — 944ddde

#### Manual

- [x] 2.4 `/flashcards` pokazuje własne karty posortowane od najnowszej — 944ddde
- [x] 2.5 Niezalogowany na `/flashcards` → redirect `/auth/signin` — 944ddde
- [x] 2.6 „Dodaj kartę" zapisuje; karta trwa po reloadzie — 944ddde
- [x] 2.7 „Edytuj" zapisuje zmianę; zmiana trwa po reloadzie — 944ddde
- [x] 2.8 „Usuń → Na pewno? Tak" usuwa; „Anuluj" zostawia kartę; stan zgodny po reloadzie — 944ddde
- [x] 2.9 Pusta kolekcja → empty-state z linkiem do `/generate` — 944ddde
- [x] 2.10 Linki z dashboardu i `/generate` prowadzą do `/flashcards` — 944ddde
- [x] 2.11 Generowanie (S-01) bez regresji — `saved` poprawnie czytane z rozszerzonej odpowiedzi — 944ddde
