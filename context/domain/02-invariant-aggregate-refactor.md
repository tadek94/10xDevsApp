---
title: Invariant → Aggregate Refactor Plan — 10xCards
created: 2026-07-02
type: refactor-plan
---

# Refaktor niezmiennika w agregat-strażnik — 10xCards

> Produkt tego dokumentu to **PLAN refaktoru**, nie implementacja. Kod produkcyjny
> nie jest modyfikowany. Każde twierdzenie o obecnym stanie ma cytat `plik:linia`
> zweryfikowany bezpośrednio w kodzie. Poprzednik: [`01-domain-distillation.md`](./01-domain-distillation.md).

---

## KROK 0 — Kontekst (odkryty, nie założony)

**Dokumenty wymagań (przeczytane):** `context/foundation/prd.md` (wizja, Success Criteria,
FR-001…FR-011), `README.md` (esencja produktu, `README.md:5`), `context/foundation/tech-stack.md`.

**Stack i warstwy, w których żyje logika biznesowa:**

| Warstwa | Gdzie | Rola wobec niezmienników |
|---|---|---|
| **API / handlery** | `src/pages/api/flashcards/*`, `src/pages/api/account/delete.ts` | Walidacja zod + zapytania Supabase; **dziś to tu żyje cała logika** |
| **Domena / algorytm** | `src/lib/srs.ts` (FSRS + granica Date↔ISO), `src/lib/ai.ts` (klient LLM) | Jedyny istniejący „serwis domenowy" (SRS). **Brak warstwy encji/agregatów.** |
| **Persystencja** | `supabase/migrations/*` (schemat, RLS, CHECK, trigger, cascade) | Egzekwuje część niezmienników na poziomie DB |
| **UI / stan** | `src/components/flashcards/*` (React), `src/pages/*.astro` (server load) | Trzyma stan sesji akceptacji — **wyłącznie w pamięci przeglądarki** |
| **Typy** | `src/types.ts` | `interface Flashcard`, DTO |

**Kluczowa obserwacja startowa:** nie ma osobnego modelu domenowego — logika biznesowa jest
rozsmarowana po handlerach API, a jedynym trwałym bytem jest wiersz tabeli `flashcards`
(`supabase/migrations/20260528000000_create_flashcards.sql:2-9`). To środowisko, w którym
niezmiennik nie ma gdzie zamieszkać poza schematem DB albo klientem.

---

## KROK 1 — Zidentyfikowane niezmienniki biznesowe

Reguły, które w tej domenie MUSZĄ być zawsze prawdziwe (wyprowadzone z PRD **oraz** z kodu):

| # | Niezmiennik | Źródło (dokument) | Życie w kodzie |
|---|---|---|---|
| **N1** | **Każda zapisana fiszka ma jednoznaczne, ustalone przy tworzeniu pochodzenie: AI albo ręczne.** | Success Criteria: „75% of all flashcards… created via AI generation, not manually" `prd.md:36` | **NIGDZIE** — brak kolumny/pola; potwierdzone `grep` (0 trafień w `src` i `supabase`) |
| **N2** | **Fiszka z AI pamięta, czy została zredagowana przed akceptacją.** | Secondary: „User edits ≤ 25% of AI-generated cards before accepting" `prd.md:48` | **NIGDZIE** — stan edycji ginie przy zapisie (`FlashcardGenerator.tsx:89`) |
| **N3** | Fiszka należy zawsze do dokładnie jednego użytkownika; nie istnieje bez właściciela. | „accessible only to that user" `prd.md:123` | **Egzekwowany** — FK `NOT NULL` + RLS `create_flashcards.sql:4,32-35` |
| **N4** | Front i back są niepuste. | „front + back" `prd.md:60` | **Egzekwowany dwutorowo** — DB `NOT NULL` `create_flashcards.sql:5-6`; zod `index.ts:11-12`, `[id].ts:10-12` |
| **N5** | Stan SRS jest zawsze poprawny (`state ∈ 0..3`). | `types.ts:9` | **Egzekwowany** — `CHECK (srs_state BETWEEN 0 AND 3)` `add_srs_fields.sql:18` |
| **N6** | `srs_reps` rośnie monotonicznie; równoległe powtórki serializowane. | wyprow. z „scheduling based on past recall" `prd.md:133` | **Egzekwowany** — optimistic guard `.eq("srs_reps", …)` → 409 `review.ts:70-87` |
| **N7** | Edycja fiszki przeżywa reload (brak cichej utraty danych). | Guardrail `prd.md:52` | **Egzekwowany** — PATCH utrwala `[id].ts:47-51` |
| **N8** | Usunięcie konta kasuje wszystkie dane bez śladu (RODO Art. 17). | FR-011 `prd.md:117` | **Egzekwowany** — `admin.deleteUser` `delete.ts:19` + cascade `create_flashcards.sql:4` |

---

## KROK 2 — Klasyfikacja i wybór #1

Trzy osie oceny (a) rdzeniowość · (b) rozsmarowanie po warstwach · (c) realna egzekucja:

| # | (a) Rdzeniowość dla sensu produktu | (b) Rozsmarowanie | (c) Egzekucja |
|---|---|---|---|
| **N1** | **Maksymalna** — jedna z dwóch metryk głównych `prd.md:36` | dokument→klient (ginie na granicy `fetch`) | **ZERO** — nie istnieje |
| **N2** | **Maksymalna** — metryka jakości AI `prd.md:48` | jw. | **ZERO** — nie istnieje |
| N3 | Wysoka (NFR) | DB + 5 handlerów | Mocna (RLS) |
| N4 | Średnia (table stakes) | DB + 2× zod + klient | Mocna, ale zdublowana |
| N5 | Średnia (kupione z półki) | DB + `srs.ts` | Mocna |
| N6 | Średnia | 1 handler | Mocna |
| N7 | Wysoka (guardrail) | 5 handlerów | Mocna, lecz rozproszona |
| N8 | Wysoka (prawo) | DB + admin API | Mocna |

**Wybór: N1 + N2 (traktowane łącznie jako jeden niezmiennik pochodzenia).**

**Uzasadnienie.** Kryterium KROK 2 to „jednocześnie najbardziej rdzeniowy **I** najsłabiej
egzekwowany". N1/N2 wygrywają na obu osiach bezapelacyjnie:

- **Rdzeniowość.** Produkt istnieje po to, by odpowiedzieć na jedno pytanie: „czy AI generuje
  fiszki dość dobre, by je zachować?" (`prd.md:22`). Obie metryki główne (`prd.md:35-36`) oraz
  metryka jakości (`prd.md:48`) są **zdefiniowane** przez to, czy karta pochodzi z AI i czy
  została zredagowana. To nie jest metadana pomocnicza — to jedyny mierzalny sygnał hipotezy MVP.
- **Egzekucja = zero.** Potwierdzone bezpośrednio: `grep -riE "provenance|ai_generated|source:|edited_before|accepted_at"`
  po `src/` i `supabase/` daje **0 trafień**. Niezmiennika nie ma ani w schemacie
  (`create_flashcards.sql:2-9`, `add_srs_fields.sql:10-19`), ani w kodzie, ani nawet w kliencie —
  stan „accepted/editing" żyje tylko w pamięci wyspy (`FlashcardGenerator.tsx:9-17`) i jest
  odrzucany przy zapisie (`FlashcardGenerator.tsx:89` mapuje wyłącznie `{front, back}`).

Każdy inny niezmiennik (N3–N8) jest już solidnie egzekwowany. Refaktorowanie ich to polerowanie
działającego mechanizmu. **N1/N2 to jedyny przypadek, w którym rdzeń produktu jest niemierzalny —
MVP nie potrafi ocenić własnej hipotezy.** To definicja „najcenniejszego refaktoru".

**Reframing na prawdziwy niezmiennik (nie „brakującą kolumnę").** N1/N2 wyrażone jako reguły
zawsze-prawdziwe, które agregat ma bronić:

1. **Pochodzenie jest obowiązkowe i ustalane w chwili tworzenia.** Nie da się utrwalić fiszki bez
   zadeklarowanego źródła (`ai` | `manual`).
2. **Pochodzenie jest niezmienne.** Edycja `front/back` nigdy nie zmienia `source` (karta AI po
   edycji pozostaje kartą AI).
3. **Fakt edycji-przed-akceptacją jest zapisany atomowo z wierszem karty** i **wyliczony po stronie
   serwera** (porównanie oryginału AI z tekstem zaakceptowanym), a nie deklarowany przez klienta.

---

## KROK 3 — Diagnoza wybranego niezmiennika (gdzie dziś „żyje" reguła)

Reguła N1/N2 **nie żyje nigdzie** jako egzekwowany fakt. Poniżej — każde miejsce, w którym
powinna być, a nie jest, oraz gdzie jest „połykana":

### 3.1 Warstwa persystencji — reguła nieobecna w modelu

```
create_flashcards.sql:2-9   → kolumny: id, user_id, front, back, created_at, updated_at
add_srs_fields.sql:10-19    → dołożono 9 kolumn srs_*
```
Brak `source`, `edited_before_accept`, `accepted_at`. Schemat nie potrafi wyrazić różnicy między
kartą z AI a ręczną. **DB nie egzekwuje N1.**

### 3.2 Warstwa API — handler jest ślepy na pochodzenie

`POST /api/flashcards` obsługuje **oba** ścieżki tworzenia (AI-accept i ręczną) tym samym kodem,
który **odrzuca** metadane pochodzenia:

```
index.ts:7-17   → SaveCardsSchema akceptuje wyłącznie { cards: [{front, back}] }
index.ts:48-52  → rows = cards.map(c => ({ front, back, user_id }))   // provenance nie ma jak wejść
```
Handler nie odróżnia AI od ręcznego, bo **nie dostaje tej informacji** i nie ma jej gdzie zapisać.
**API nie egzekwuje N1/N2.**

### 3.3 Warstwa klienta — jedyny „strażnik", i to nieszczelny

Wyspa generatora **zna** pochodzenie i fakt edycji, ale gubi je:

```
FlashcardGenerator.tsx:9-17   → SuggestionCard { accepted, editing, editFront, editBack }  (tylko w RAM)
CardReviewItem onSaveEdit → FlashcardGenerator.tsx:193
                              → updateCard(id, { front, back, editFront, editBack, editing:false })
                              → NADPISUJE card.front/back edytowaną wartością; ORYGINAŁ AI PRZEPADA
FlashcardGenerator.tsx:89     → .map(c => ({ front: c.front, back: c.back }))  // pochodzenie i edycja odcięte
```
Konsekwencja: **klient jest jedynym miejscem, gdzie reguła w ogóle istnieje**, a i tam jest
naruszalna — po edycji oryginalny tekst AI jest bezpowrotnie utracony (`:193`), więc faktu
„edited-before-accept" nie da się już odtworzyć nawet po stronie przeglądarki.

### 3.4 Ścieżka ręczna — również ślepa

```
FlashcardCollection.tsx:34-38 → POST /api/flashcards { cards: [{front:newFront, back:newBack}] }
```
Trafia w ten sam ślepy endpoint (3.2). Karta ręczna nie jest oznaczana jako `manual`.

### 3.5 Gdzie błąd jest „połykany" zamiast zatrzymywać operację

To najgroźniejsze: **nie ma błędu do połknięcia — jest cicha utrata faktu.** Zapis „udaje się"
(HTTP 200, `index.ts:62`), użytkownik widzi „Zapisano N kart" (`FlashcardGenerator.tsx:104`),
a domenowo właśnie utracono jedyny sygnał, dla którego produkt powstał. Operacja nie zawodzi —
ona **fałszywie potwierdza sukces**, co jest gorsze niż fail-fast.

**Wniosek diagnozy:** egzekucja N1/N2 jest dziś w 100% po stronie klienta (`FlashcardGenerator.tsx`),
nieszczelna i nietransmitowana. Serwer i baza są całkowicie nieświadome reguły.

---

## KROK 4 — Projekt agregatu-strażnika

### 4.1 Idea

Wprowadzić **agregat `Flashcard`** jako JEDYNE miejsce, w którym powstaje fiszka. Pochodzenie i
fakt edycji przestają być „polem, które klient może dosłać" — stają się **strukturalną
konsekwencją tego, którą metodą fabryczną utworzono kartę**. Egzekucja przenosi się z klienta na
serwer.

Kluczowa decyzja projektowa: **rozdzielić dwie ścieżki tworzenia na dwie metody i dwa endpointy**,
z których każdy „na sztywno" stempluje `source`. Dzięki temu `source` nie jest wartością zaufaną od
klienta — jest zdeterminowany przez wywołaną metodę. `edited_before_accept` jest **wyliczany na
serwerze** przez porównanie oryginału AI z tekstem zaakceptowanym (klient przesyła oba), więc też
nie jest deklaracją klienta.

### 4.2 Agregat + błędy domenowe (`src/lib/domain/flashcard.ts` — nowy)

```ts
export type FlashcardSource = "ai" | "manual";

// Błędy domenowe: nazwane, fail-fast. Nielegalna operacja RZUCA — nie loguje-i-jedzie dalej.
export class EmptyCardContentError extends Error {}       // front/back puste po trim
export class ProvenanceImmutableError extends Error {}    // próba zmiany source po utworzeniu

// Value object niesiony do repozytorium (jeszcze bez id/timestamps z DB).
export interface NewFlashcard {
  front: string;
  back: string;
  source: FlashcardSource;
  edited_before_accept: boolean;
}

function requireNonEmpty(front: string, back: string): void {
  if (front.trim().length === 0 || back.trim().length === 0) {
    throw new EmptyCardContentError("front/back must be non-empty");   // precondition N4 w jednym miejscu
  }
}

// FABRYKA 1 — ręczne tworzenie. source ZAWSZE 'manual' (strukturalnie, nie z parametru).
export function createManual(input: { front: string; back: string }): NewFlashcard {
  requireNonEmpty(input.front, input.back);
  return {
    front: input.front.trim(),
    back: input.back.trim(),
    source: "manual",
    edited_before_accept: false,          // pojęcie nie dotyczy kart ręcznych
  };
}

// FABRYKA 2 — akceptacja sugestii AI. source ZAWSZE 'ai'. edited WYLICZONY z porównania.
export function createFromSuggestion(input: {
  aiFront: string; aiBack: string;        // oryginał wygenerowany przez AI
  front: string; back: string;            // wersja zaakceptowana (być może zredagowana)
}): NewFlashcard {
  requireNonEmpty(input.front, input.back);
  const edited =
    input.front.trim() !== input.aiFront.trim() ||
    input.back.trim()  !== input.aiBack.trim();
  return {
    front: input.front.trim(),
    back: input.back.trim(),
    source: "ai",
    edited_before_accept: edited,         // FAKT wyliczony na serwerze, nie zaufany od klienta
  };
}

// Edycja istniejącej karty NIE ma settera na source → N1 (niezmienność) egzekwowana przez typ.
// Gdyby jakikolwiek kod próbował podać source w update — repozytorium odrzuca (patrz 4.3).
```

**Dlaczego to egzekwuje regułę:** nie istnieje ścieżka utworzenia `NewFlashcard` bez `source`
(TypeScript wymaga pola, a jedyni jego producenci to dwie fabryki, które je zaszywają). `edited_*`
jest liczony, nie przyjmowany. Puste treści rzucają `EmptyCardContentError` **przed** dotknięciem DB.

### 4.3 Repozytorium (`src/lib/domain/flashcard-repository.ts` — nowy)

Konsoliduje powtarzany w 5 miejscach wzorzec `getSession()` (rozjazd #5 destylacji:
`index.ts:46`, `[id].ts:45`, `review.ts:49`, `due.ts:20`, `flashcards.astro:18`) w jedną granicę.

```ts
export class FlashcardRepository {
  constructor(private supabase: SupabaseClient, private userId: string) {}

  // Jedno miejsce hydracji sesji — precondition RLS przestaje być „pamiętane" w każdym handlerze.
  private async hydrate() { await this.supabase.auth.getSession(); }

  // Zapis agregatu(-ów) jako JEDNA instrukcja INSERT (atomowa): albo wszystkie wiersze, albo żaden.
  async saveNew(cards: NewFlashcard[]): Promise<PersistedCard[]> {
    await this.hydrate();
    const rows = cards.map((c) => ({ ...c, user_id: this.userId }));  // source/edited jadą do DB
    const { data, error } = await this.supabase
      .from("flashcards")
      .insert(rows)
      .select("id, front, back, source, edited_before_accept, created_at");
    if (error) throw new RepositoryError(error);   // fail-fast, nie „return []"
    return data;
  }

  // Edycja treści — świadomie NIE selektuje ani nie ustawia `source` → pochodzenie nietykalne.
  async updateContent(id: string, front: string, back: string): Promise<PersistedCard | null> {
    requireNonEmpty(front, back);
    await this.hydrate();
    const { data, error } = await this.supabase
      .from("flashcards")
      .update({ front: front.trim(), back: back.trim() })   // brak `source` w payloadzie
      .eq("id", id)
      .select("id, front, back, source, created_at");
    if (error) throw new RepositoryError(error);
    return data[0] ?? null;   // null → 404 w handlerze (RLS odfiltrował cudzą/nieistniejącą)
  }
}
```

Atomowość: pojedynczy `insert(rows)` jest atomowy na poziomie instrukcji Postgres — partia
zaakceptowanych sugestii zapisuje się w całości albo wcale, każdy wiersz z kompletnym pochodzeniem.

### 4.4 Cienkie API (parse → metoda agregatu → mapowanie błędu)

**Rozdział endpointów** — `source` staje się funkcją trasy, nie pola:

**(a) `POST /api/flashcards` — odtąd TYLKO ręczne (`index.ts`):**
```ts
const parsed = ManualCardSchema.parse(body);          // { front, back }
const card = createManual(parsed);                    // source='manual' zaszyte
const [saved] = await repo.saveNew([card]);
return Response.json({ saved: 1, cards: [saved] });
// catch EmptyCardContentError → 400 "Card content must not be empty"
```

**(b) `POST /api/flashcards/accept` — NOWY, TYLKO akceptacja sugestii AI:**
```ts
const parsed = AcceptSchema.parse(body);              // { cards: [{aiFront, aiBack, front, back}] }, .min(1).max(15)
const cards = parsed.cards.map(createFromSuggestion); // source='ai', edited wyliczony
const saved = await repo.saveNew(cards);
return Response.json({ saved: saved.length, cards: saved });
// catch EmptyCardContentError → 400 ; catch RepositoryError → 500
```

Mapowanie błędów domenowych na HTTP w jednym `try/catch` per handler; **nielegalna operacja
zwraca 4xx/5xx, nigdy cichy 200.** Egzekucja jest teraz na serwerze: klient nie może zapisać karty
bez pochodzenia, bo endpoint (a) zawsze stempluje `manual`, a (b) zawsze `ai`.

### 4.5 Migracja (`supabase/migrations/2026…_add_provenance_fields.sql` — nowa)

```sql
ALTER TABLE flashcards
  ADD COLUMN source               TEXT        NOT NULL DEFAULT 'unknown'
    CHECK (source IN ('ai', 'manual', 'unknown')),
  ADD COLUMN edited_before_accept BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN accepted_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now());

-- Wsparcie zapytań metryk (KROK 5.4).
CREATE INDEX idx_flashcards_user_source ON flashcards (user_id, source);
```
`'unknown'` **kwarantannuje wiersze sprzed refaktoru** (ich pochodzenia nie da się uczciwie
odtworzyć — patrz 3.3). Agregat **nigdy** nie emituje `'unknown'`; nowe karty to zawsze `ai`|`manual`.
Zapytania metryk filtrują `source IN ('ai','manual')`. Bez nowych polityk RLS — istniejące filtrują
po `user_id`, nie po kolumnie (`add_srs_fields.sql:6-8`).

### 4.6 Zmiana w wyspie (warunek konieczny dla N2)

Aby serwer mógł wyliczyć `edited_before_accept`, wyspa musi **zachować oryginał AI**. Dziś ginie
(`FlashcardGenerator.tsx:193`). Minimalna zmiana:

```
SuggestionCard  → dodać pola aiFront, aiBack (ustawiane raz z odpowiedzi generacji, NIGDY nie nadpisywane)
handleSave      → POST /api/flashcards/accept z { aiFront, aiBack, front, back } per karta
```

---

## KROK 5 — Before/after, plan faz, testy

### 5.1 Before / after per miejsce reguły

| Miejsce | Before | After |
|---|---|---|
| Schemat DB `create_flashcards.sql:2-9` | brak pochodzenia | `source` + `edited_before_accept` + `accepted_at` (CHECK) |
| `index.ts:48-52` | `map → {front, back, user_id}` (metadane odcięte) | `createManual()` → `repo.saveNew()`; `source='manual'` zaszyte |
| Ścieżka AI-accept | ten sam ślepy endpoint | **nowy** `POST /api/flashcards/accept` → `createFromSuggestion()`; `source='ai'`, `edited` wyliczony |
| `FlashcardGenerator.tsx:89,193` | oryginał AI nadpisany, pochodzenie nietransmitowane | `aiFront/aiBack` zachowane; wysyłane do `/accept` |
| Wzorzec `getSession()` (5 plików) | powtarzany, „pamiętany" per handler | jedna granica w `FlashcardRepository.hydrate()` |
| Egzekucja N1/N2 | klient (nieszczelny) | serwer (strukturalny) |
| Pomiar metryk `prd.md:35-36,48` | niemożliwy | zapytanie po `source`/`edited_before_accept` |

### 5.2 Plan faz (test-first tam, gdzie runner pozwala)

Projekt ma dyscyplinę testową: `vitest` (unit + integration) + Playwright (e2e),
skrypty `test`, `test:integration`, `test:e2e` (`package.json`). Fazy 0, 2, 3 idą **test-first**.

| Faza | Zakres | Test-first? | Weryfikacja |
|---|---|---|---|
| **0** | Testy jednostkowe agregatu (czerwone) — fabryki + błędy domenowe | ✅ | `npm test` = czerwony |
| **1** | Migracja `add_provenance_fields.sql` (człowiek uruchamia `db push` — patrz reguła Supabase) | — | schemat zawiera kolumny |
| **2** | `flashcard.ts` (agregat + błędy) + `flashcard-repository.ts` | ✅ (faza 0 → zielony) | `npm test` zielony |
| **3** | Cienkie endpointy: `index.ts` (manual) + nowy `accept.ts`; testy integracyjne | ✅ | `npm run test:integration` |
| **4** | Wyspa: zachowanie `aiFront/aiBack`, wysyłka do `/accept` | częściowo (test komponentu) | `FlashcardGenerator.test.tsx` |
| **5** | Read-model metryk (widok/zapytanie SQL) — payoff hipotezy MVP | — | ręczne zapytanie zwraca odsetki |

Kolejność respektuje reguły repo: migracja i `db push` są **human-only** (CLAUDE.md / [[supabase-cloud-only]]);
`context/archive/` nietykalny.

### 5.3 Przypadki testowe niezmiennika (legalne i nielegalne)

**Jednostkowe (agregat) — legalne:**
- `createManual({front:'P', back:'O'})` → `source='manual'`, `edited_before_accept=false`.
- `createFromSuggestion({aiFront:'P',aiBack:'O',front:'P',back:'O'})` → `source='ai'`, `edited=false`.
- `createFromSuggestion({aiFront:'P',aiBack:'O',front:'P!',back:'O'})` → `source='ai'`, `edited=true`.
- Whitespace-only różnica (`'P'` vs `' P '`) → `edited=false` (porównanie po `trim`).

**Jednostkowe — nielegalne (MUSZĄ rzucić nazwany błąd, nic nie utrwalać):**
- `createManual({front:'', back:'O'})` → `EmptyCardContentError`.
- `createManual({front:'   ', back:'O'})` → `EmptyCardContentError` (po trim).
- `createFromSuggestion({…, front:'', back:'O'})` → `EmptyCardContentError`.

**Niezmienność pochodzenia (N1):**
- `updateContent()` nie zawiera `source` w payloadzie — test: po edycji karty AI ponowny odczyt
  z DB wciąż `source='ai'` (integracyjny).

**Integracyjne (przez realne handlery, read-back service-role — wzorzec `create.integration.test.ts`):**
- `POST /api/flashcards` (manual) → wiersz w DB ma `source='manual'`.
- `POST /api/flashcards/accept` karta zredagowana → `source='ai'`, `edited_before_accept=true`.
- `POST /api/flashcards/accept` karta nietknięta → `source='ai'`, `edited_before_accept=false`.
- Metryka: po utworzeniu 3× AI + 1× manual, `count(*) FILTER (WHERE source='ai') / count(*)` = 0.75.

### 5.4 Read-model metryk (payoff)

```sql
-- Metryka główna prd.md:36 (odsetek kart z AI) + metryka jakości prd.md:48 (odsetek edytowanych).
SELECT
  count(*) FILTER (WHERE source = 'ai')::float / nullif(count(*) FILTER (WHERE source IN ('ai','manual')), 0)  AS ai_share,
  count(*) FILTER (WHERE source = 'ai' AND edited_before_accept)::float
    / nullif(count(*) FILTER (WHERE source = 'ai'), 0)                                                          AS edit_rate
FROM flashcards
WHERE user_id = $1;
```

### 5.5 Nowe nazwy „load-bearing" do zarejestrowania

Projekt nie prowadzi formalnego rejestru kontraktów, ale te nazwy są odtąd nośne i warto je
utrwalić w `src/types.ts` / `context/foundation/lessons.md`:

- **Typy/domena:** `FlashcardSource` (`'ai'|'manual'`), `NewFlashcard`, `EmptyCardContentError`,
  `ProvenanceImmutableError`, `createManual`, `createFromSuggestion`, `FlashcardRepository`.
- **Kolumny DB:** `source`, `edited_before_accept`, `accepted_at`.
- **Endpoint:** `POST /api/flashcards/accept` (AI-accept) — rozdzielony od `POST /api/flashcards` (manual).
- **Migracja:** `add_provenance_fields`.

---

## Podsumowanie

Wybranym niezmiennikiem #1 jest **pochodzenie fiszki** (N1: każda karta ma ustalone przy tworzeniu
źródło `ai`|`manual`; N2: karta AI pamięta, czy była edytowana przed akceptacją) — wybór wygrywa na
obu osiach kryterium KROK 2: jest **maksymalnie rdzeniowy**, bo obie metryki sukcesu MVP
(`prd.md:35-36,48`) są nim wprost zdefiniowane, i **zerowo egzekwowany**, co potwierdziłem `grep`-em
dającym 0 trafień w `src/` i `supabase/`. Diagnoza pokazała, że reguła żyje dziś wyłącznie w pamięci
przeglądarki (`FlashcardGenerator.tsx:9-17`), jest nieszczelna (oryginał AI ginie przy edycji, `:193`)
i nietransmitowana (`:89` odcina metadane), a wspólny endpoint `POST /api/flashcards` jest ślepy na
pochodzenie (`index.ts:48-52`) i **fałszywie potwierdza sukces** (200) zamiast fail-fast. Projekt
wprowadza agregat `Flashcard` z dwiema fabrykami, które zaszywają `source` strukturalnie (przez
rozdział endpointów, nie zaufane pole), wyliczają `edited_before_accept` na serwerze i rzucają
nazwany `EmptyCardContentError` na pustej treści; repozytorium konsoliduje rozproszony wzorzec
`getSession()` w jedną granicę i zapisuje partię atomowym `INSERT`-em. Plan jest fazowany i
test-first (faza 0 czerwona → 2/3 zielone), respektuje human-only migracje Supabase, a jego payoff
to read-model, który po raz pierwszy czyni hipotezę MVP mierzalną.
