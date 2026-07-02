---
title: Anti-Corruption Layer — izolacja Supabase spod warstw domeny, API i UI
created: 2026-07-02
type: refactor-plan
---

# Anti-Corruption Layer dla 10xCards

> Produkt tego dokumentu to **PLAN refaktoru**, nie implementacja. Nie zmienia kodu
> produkcyjnego. Wszystkie cytaty `plik:linia` zweryfikowane na stanie `main` z 2026-07-02.

## KROK 0 — Kontekst

- **Stack**: Astro 6 (SSR, `output: "server"`) + React 19 (wyspy `client:load`) + Supabase (auth + Postgres) + Cloudflare Workers. (`README.md:9-16`, `context/foundation/tech-stack.md:5-24`)
- **Zależności zewnętrzne o ryzyku przecieku** (`package.json:21-46`):
  - `@supabase/ssr` + `@supabase/supabase-js` — auth i persystencja.
  - `openai` — generacja AI (przez OpenRouter).
  - `ts-fsrs` — algorytm powtórek (SRS).
- **Warstwy kodu**: `src/middleware.ts` (auth gate) → `src/pages/**` (Astro SSR pages + `src/pages/api/**` endpointy) → `src/components/**` (React islands) → `src/lib/**` (serwisy/helpery) → `src/types.ts` (typy domenowe/DTO).
- **Deklaracja intencji (wymienialność)**: `src/lib/srs.ts:5-6` — *„Single owner of the FSRS algorithm and the Date <-> ISO-string boundary. Date objects never leak past this module”*. Zespół **zna** wzorzec ACL i zastosował go do `ts-fsrs`. Ta sama dyscyplina **nie** została zastosowana do Supabase.

## KROK 1 — Identyfikacja przeciekających zależności

### Oś A — `ts-fsrs` (już zaizolowana, kontrprzykład)
Jedyny plik, który zna bibliotekę: `src/lib/srs.ts:1` (`import ... from "ts-fsrs"`). Typ `Card`,
enum `Rating`, `createEmptyCard`, `fsrs()` — wszystko zamknięte w tym module. Do reszty systemu
wychodzi tylko domenowy `SrsState` (ISO-stringi + liczby, `src/types.ts:36-46`). `srs_state:
number` w `Flashcard` to kolumna persystencji, **nie** typ biblioteki. **Werdykt: nie przecieka.**

### Oś B — `openai` (przeciek wąski, 2 pliki)
- `src/lib/ai.ts:3` — `import OpenAI from "openai"`, konstrukcja klienta.
- `src/pages/api/flashcards/generate.ts:32-40` — kształt wire biblioteki (`ai.chat.completions.create`,
  `messages[]`, `completion.choices[0]?.message?.content`) wpleciony do endpointu.
Dwa pliki, jeden konsument. Umiarkowane.

### Oś C — `@supabase/*` (przeciek dominujący)
Ta sama zależność jest importowana i „znana” przez **13 plików w 4 warstwach** (middleware, Astro
pages/UI, API, typy). Wszystkie pliki, które ją dziś znają:

| # | Plik:linia | Co przecieka |
|---|---|---|
| 1 | `src/lib/supabase.ts:1-2` | fabryka klientów — **jedyne legalne miejsce** (dom ACL) |
| 2 | `src/env.d.ts:3` | typ biblioteki `User` z `@supabase/supabase-js` w kontrakcie `App.Locals` |
| 3 | `src/middleware.ts:2,7,12` | `createClient`, `supabase.auth.getUser()` |
| 4 | `src/pages/flashcards.astro:5,14,18-22` | query builder w **warstwie UI** (SSR page) |
| 5 | `src/pages/review.astro:5,13,16,18-22` | query builder w **warstwie UI** (SSR page) |
| 6 | `src/pages/api/flashcards/index.ts:3,38,46,54` | `.from().insert().select()` |
| 7 | `src/pages/api/flashcards/due.ts:2,13,20,23-27` | `.from().select().lte().order()` |
| 8 | `src/pages/api/flashcards/[id].ts:3,37,45,47-51,79,88` | `.update().eq()`, `.delete().eq()` |
| 9 | `src/pages/api/flashcards/[id]/review.ts:3,42,49,53,70-75` | `.select().eq()`, `.update().eq().eq()` |
| 10 | `src/pages/api/account/delete.ts:2,12,19,31,34` | `admin.auth.admin.deleteUser`, `auth.signOut` |
| 11 | `src/pages/api/auth/signin.ts:2,9,13` | `auth.signInWithPassword` |
| 12 | `src/pages/api/auth/signup.ts:2,9,13` | `auth.signUp` |
| 13 | `src/pages/api/auth/signout.ts:2,5,7` | `auth.signOut` |

## KROK 2 — Klasyfikacja i wybór #1

| Oś | (a) warstwy / pliki | (b) ryzyko wymiany dziś | (c) deklarowana wymienialność |
|---|---|---|---|
| A `ts-fsrs` | 1 plik / 1 warstwa | niskie — już za portem | tak, i **dotrzymana** |
| B `openai` | 2 pliki / 1 warstwa | niskie-średnie | seam AI zadeklarowany, częściowo dotrzymany |
| C `@supabase/*` | **13 plików / 4 warstwy** | **wysokie** — dotyka UI, API, middleware, typów | pozycjonowana jako „backend-as-a-service” (`tech-stack.md:24`), **kod nie dotrzymuje** |

**Wybór #1: `@supabase/*`.** Uzasadnienie: to jedyny przeciek dotykający **wszystkich czterech
warstw** naraz (w tym UI i publiczny typ `App.Locals`). Rozjazd intencja-vs-kod jest tu najostrzejszy:
`srs.ts:5-6` dowodzi, że zespół potrafi zbudować ACL, a mimo to rytuał hydratacji sesji Supabase
został **skodyfikowany jako „lekcja”** (`context/foundation/lessons.md:32` — *„Przed zapytaniami do
tabel RLS w endpoincie wywołaj await supabase.auth.getSession()”*) zamiast schowany za portem.
Przeciek nie tylko istnieje — został zinstytucjonalizowany.

## KROK 3 — Diagnoza

### 3.1 Duplikacja (cytaty)
- **Rytuał `getSession()` przed każdym zapytaniem RLS — 7 wystąpień**:
  `flashcards.astro:18`, `review.astro:16`, `index.ts:46`, `due.ts:20`, `[id].ts:45`, `[id].ts:86`,
  `[id]/review.ts:49`. To samo zaklęcie kopiowane ręcznie; `lessons.md:32` czyni z tego regułę
  procesu — sygnał, że brakuje jednego miejsca, które by to robiło.
- **Zapytanie o karty „due” zduplikowane WERBATIM** między warstwą UI a API:
  - `review.astro:18-22`: `.from("flashcards").select("id, front, back").lte("srs_due", formatDate(new Date())).order("srs_due", { ascending: true })`
  - `due.ts:23-27`: **identyczne** query. Jedna zmiana reguły „co znaczy due” = edycja w dwóch warstwach.
- **Powtarzane listy kolumn** (kształt persystencji rozlany po plikach): `"id, front, back, created_at"`
  w `flashcards.astro:21`, `index.ts:54`, `[id].ts:51`; `"id, front, back"` w `review.astro:20`,
  `due.ts:25`.
- **Guard `if (!supabase) → "Database not configured"`** powtórzony w każdym endpoincie:
  `index.ts:39`, `due.ts:14`, `[id].ts:38`, `[id].ts:80`, `[id]/review.ts:43`.
- **Obsługa surowego `{ data, error }` + `console.error(error)`** rozlana po wszystkich konsumentach
  (`index.ts:56`, `due.ts:29`, `[id].ts:53`, `[id].ts:90`, `[id]/review.ts:55,77`, `flashcards.astro:23`,
  `review.astro:23`).

### 3.2 Przecieki przez granice (najgroźniejsze)
- **Biblioteka persystencji w warstwie UI.** `.astro` (SSR) importują query builder wprost
  (`flashcards.astro:5,19-22`, `review.astro:5,18-22`) i przekazują wynik do wysp React
  (`client:load`, `flashcards.astro:35`, `review.astro:35`). Warstwa prezentacji zna semantykę
  PostgREST (`.lte`, `.order`, `.eq`) i nazwy kolumn SRS. `supabase.ts` czyta sekrety server-only i
  zwraca `null` po stronie klienta, więc runtime jest bezpieczny — ale **wiedza o kształcie zapytania
  mieszka w page frontmatter**, o jeden import od wyspy klienckiej.
- **Typ biblioteki w publicznym kontrakcie.** `src/env.d.ts:3` osadza `@supabase/supabase-js`.`User`
  w `App.Locals.user` — każdy handler i middleware (`context.locals.user`) jest sprzężony z typem
  Supabase. Wymiana dostawcy auth zmienia globalny kontrakt frameworka.
- **Dialekt zapytań = język domeny.** Filtry PostgREST (`.eq`, `.lte`, `.order`, guard optymistyczny
  `.eq("srs_reps", ...)` w `[id]/review.ts:70-75`) są dziś jedynym sposobem wyrażania reguł domenowych.

### 3.3 Rozjazd intencja-vs-kod (cytaty)
- `context/foundation/tech-stack.md:24`: *„Supabase covers auth and Postgres persistence out of the
  box…”* — traktowana jako wymienny podkład.
- `src/lib/srs.ts:5-6`: wzorzec ACL zadeklarowany i **dotrzymany** dla `ts-fsrs`.
- `src/lib/supabase.ts:29`: *„NEVER import this into client code”* — komentarz broni granicy, której
  brak typu wymusza ręcznie, zamiast portem.
- `context/foundation/lessons.md:32`: duplikacja awansowana do rangi reguły procesu — dowód, że brak
  pojedynczego właściciela.

## KROK 4 — Projekt ACL

Dwa wąskie porty domenowe + adaptery Supabase. Reszta kodu zna **wyłącznie porty i typy domenowe**.
Lokalizacja zgodna z konwencją (`src/lib/services/`, CLAUDE.md „Services/helpers go in `src/lib/`”):

```
src/lib/
  supabase.ts                      # (istnieje) fabryka klientów — jedyny import @supabase/*
  services/
    flashcard-repository.ts        # PORT: interfejs domenowy (bez typów Supabase)
    flashcard-repository.supabase.ts  # ADAPTER: implementacja przez query builder
    auth-gateway.ts                # PORT: interfejs auth
    auth-gateway.supabase.ts       # ADAPTER: signIn/signUp/signOut/currentUser/deleteAccount
```

### 4.1 Domenowy value object — `AuthUser` (zastępuje przeciekający `User`)

```ts
// src/types.ts — dodaj
/** Jedyny kształt użytkownika znany domenie/UI. Zero pól specyficznych dla Supabase. */
export interface AuthUser {
  id: string;
  email: string | null;
}
```

```ts
// src/env.d.ts — po refaktorze (koniec przecieku typu biblioteki)
declare namespace App {
  interface Locals {
    user: import("@/types").AuthUser | null;   // było: @supabase/supabase-js .User
  }
}
```

### 4.2 Port `FlashcardRepository` (jedyne miejsce wiedzy o kształcie persystencji)

```ts
// src/lib/services/flashcard-repository.ts
import type { ReviewCard, ReviewRating, SrsState } from "@/types";

export type CollectionCard = { id: string; front: string; back: string; created_at: string };
export type SavedCard = CollectionCard;

/** Wynik zapisu recenzji — dyskryminowany, żeby konsument nie dotykał surowego { data, error }. */
export type ReviewOutcome =
  | { status: "ok"; card: ReviewCard & { srs_due: string } }
  | { status: "not_found" }
  | { status: "conflict" };   // guard optymistyczny (srs_reps) — patrz 4.4

export interface FlashcardRepository {
  listCollection(): Promise<CollectionCard[]>;                 // porządek: created_at desc
  listDue(now: Date): Promise<ReviewCard[]>;                   // srs_due <= now, asc — JEDNA definicja „due”
  insertMany(userId: string, cards: { front: string; back: string }[]): Promise<SavedCard[]>;
  update(id: string, patch: { front: string; back: string }): Promise<CollectionCard | null>; // null = 404
  remove(id: string): Promise<boolean>;                        // false = 404
  applyReview(id: string, rating: ReviewRating, now: Date): Promise<ReviewOutcome>;
}
```

### 4.3 Adapter Supabase (jedyny, poza fabryką, znający query builder)

```ts
// src/lib/services/flashcard-repository.supabase.ts  (pseudokod)
import type { SupabaseClient } from "@supabase/supabase-js";
import { review as applySrs } from "@/lib/srs";
import { formatDate } from "@/lib/utils";

const COLLECTION_COLS = "id, front, back, created_at";
const SRS_COLS = "srs_due, srs_stability, srs_difficulty, srs_scheduled_days, srs_reps, srs_lapses, srs_state, srs_last_review";

export function createFlashcardRepository(sb: SupabaseClient): FlashcardRepository {
  // Rytuał hydratacji RLS zamknięty w JEDNYM miejscu (był w 7 plikach).
  const withSession = async <T>(run: () => Promise<T>): Promise<T> => {
    await sb.auth.getSession();
    return run();
  };
  const unwrap = <T>({ data, error }: { data: T | null; error: unknown }): T => {
    if (error) throw new RepositoryError(error);   // koniec ręcznego { data, error } u konsumenta
    return data as T;
  };

  return {
    listCollection: () => withSession(async () =>
      unwrap(await sb.from("flashcards").select(COLLECTION_COLS).order("created_at", { ascending: false }))),

    listDue: (now) => withSession(async () =>
      unwrap(await sb.from("flashcards").select("id, front, back")
        .lte("srs_due", formatDate(now)).order("srs_due", { ascending: true }))),   // JEDNA definicja „due”

    insertMany: (userId, cards) => withSession(async () =>
      unwrap(await sb.from("flashcards")
        .insert(cards.map((c) => ({ front: c.front, back: c.back, user_id: userId })))
        .select(COLLECTION_COLS))),

    update: (id, patch) => withSession(async () => {
      const rows = unwrap(await sb.from("flashcards").update(patch).eq("id", id).select(COLLECTION_COLS));
      return rows[0] ?? null;
    }),

    remove: (id) => withSession(async () => {
      const rows = unwrap(await sb.from("flashcards").delete().eq("id", id).select("id"));
      return rows.length > 0;
    }),

    applyReview: (id, rating, now) => withSession(async () => {
      const rows = unwrap(await sb.from("flashcards").select(SRS_COLS).eq("id", id));
      if (rows.length === 0) return { status: "not_found" };
      const next = applySrs(rows[0], rating, now);                       // ts-fsrs za swoim własnym portem
      const saved = unwrap(await sb.from("flashcards").update(next)
        .eq("id", id).eq("srs_reps", rows[0].srs_reps)                   // guard optymistyczny — patrz 4.4
        .select("id, front, back, srs_due"));
      return saved.length === 0 ? { status: "conflict" } : { status: "ok", card: saved[0] };
    }),
  };
}
```

### 4.4 Rozstrzygnięcie otwartego pytania (kontrakt PostgREST) — kodować w ACL, nie w API
Guard współbieżności `.eq("srs_reps", rows[0].srs_reps)` (`[id]/review.ts:70-75`) opiera się na
kontrakcie PostgREST: UPDATE bez trafienia zwraca **pustą tablicę, nie błąd**. Ta wiedza o kontrakcie
biblioteki jest dziś zaszyta w endpoincie. Decyzja: **rozróżnienie 404 vs 409 należy do adaptera** —
`applyReview` zwraca `{ status: "not_found" | "conflict" | "ok" }`, a endpoint tylko mapuje status na
kod HTTP. Semantyka „pusty wynik = konflikt” nie wypływa już poza ACL.

### 4.5 Port `AuthGateway`

```ts
// src/lib/services/auth-gateway.ts
import type { AuthUser } from "@/types";
export type AuthResult = { ok: true } | { ok: false; message: string };

export interface AuthGateway {
  currentUser(): Promise<AuthUser | null>;         // middleware — mapuje User → AuthUser
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  deleteAccount(userId: string): Promise<AuthResult>;  // adapter woła createAdminClient() wewnątrz
}
```
Adapter `auth-gateway.supabase.ts` mapuje `supabase.auth.getUser()` → `AuthUser` (tylko `id`, `email`),
opakowuje `signInWithPassword`/`signUp`/`signOut`/`admin.deleteUser`. `middleware.ts` woła
`gateway.currentUser()` i nigdy nie widzi typu `User`.

## KROK 5 — Dowód izolacji + before/after

### 5.1 Wymiana biblioteki dotyka tylko adaptera
Po refaktorze podmiana Supabase (np. na Drizzle+Postgres albo inne auth) wymaga edycji **wyłącznie**:
`src/lib/supabase.ts`, `src/lib/services/flashcard-repository.supabase.ts`,
`src/lib/services/auth-gateway.supabase.ts`. **Bez zmian** w: tabelach/migracjach (`supabase/migrations/**`
— schemat kolumn `srs_*` jest kontraktem domeny, nie Supabase), kontraktach API (`Response.json`
kształt bez zmian), UI (`.astro` + wyspy React dostają te same typy domenowe).

### 5.2 Before/after — UI dostaje dane domenowe, nie surowy obiekt biblioteki

**Before** (`review.astro:13-28`) — UI zna query builder, filtry PostgREST, `{ data, error }`:
```ts
const supabase = createClient(Astro.request.headers, Astro.cookies);
if (supabase) {
  await supabase.auth.getSession();
  const { data, error } = await supabase.from("flashcards").select("id, front, back")
    .lte("srs_due", formatDate(new Date())).order("srs_due", { ascending: true });
  if (error) console.error(error);
  initialCards = data ?? [];
}
```
**After** — UI zna tylko port i typ domenowy:
```ts
const repo = getFlashcardRepository(Astro.request.headers, Astro.cookies);   // null-safe fabryka
const initialCards: ReviewCard[] = repo ? await repo.listDue(new Date()) : [];
```

**Before** (`[id]/review.ts:42-89`) — endpoint zarządza sesją, kolumnami SRS, guardem, `{ data, error }`,
i rozróżnia pusty wynik.
**After** — endpoint waliduje wejście i mapuje `ReviewOutcome` na HTTP:
```ts
const outcome = await repo.applyReview(id.data, parsed.data.rating, new Date());
if (outcome.status === "not_found") return Response.json({ error: "Not found" }, { status: 404 });
if (outcome.status === "conflict")  return Response.json({ error: "Conflict — reviewed concurrently" }, { status: 409 });
return Response.json({ card: outcome.card });
```

### 5.3 Koniec duplikacji
- `getSession()`: z 7 miejsc → 1 (`withSession` w adapterze).
- Definicja „due”: z 2 warstw (`review.astro` + `due.ts`) → 1 (`repo.listDue`).
- Guard `if (!supabase)`: z 5 endpointów → 1 fabryka portu.
- Listy kolumn: z 5 miejsc → 2 stałe w adapterze.

## KROK 6 — Weryfikacja i plan faz

### 6.1 Kryterium sukcesu (grep)
Po refaktorze:
```
grep -rl "@supabase/" src/     # oczekiwane: src/lib/supabase.ts,
                               #            src/lib/services/*.supabase.ts
grep -rn "\.from(\"flashcards\")\|auth\.getSession\|\.auth\.sign" src/pages/  # oczekiwane: brak trafień
```
- **Znają dziś** (13): `env.d.ts`, `middleware.ts`, `flashcards.astro`, `review.astro`,
  `api/flashcards/{index,due,[id],[id]/review}.ts`, `api/account/delete.ts`,
  `api/auth/{signin,signup,signout}.ts`, `lib/supabase.ts`.
- **Nie będą znać po refaktorze** (11): wszystkie powyższe **poza** `lib/supabase.ts` i nowymi
  adapterami. `env.d.ts` odwołuje się do `@/types.AuthUser`.

### 6.2 Plan faz (konwencja: `/10x-new` → `/10x-plan` → `/10x-tdd`/`/10x-implement`; testy integracyjne na chmurowym projekcie TEST wg `test-plan.md`)
1. **Faza 0 — typy**: dodaj `AuthUser` do `src/types.ts`; przełącz `env.d.ts:3` na `@/types.AuthUser`
   (przeciek typu domknięty niezależnie od reszty).
2. **Faza 1 — port + adapter flashcards**: `flashcard-repository.ts` + `.supabase.ts` z fabryką
   null-safe. Testy integracyjne round-trip (`test-plan.md` Risk #2) na projekcie TEST.
3. **Faza 2 — migracja konsumentów flashcards**: `index/due/[id]/[id]/review.ts`, `flashcards.astro`,
   `review.astro` na port. Usuń `getSession()`/query builder z tych plików.
4. **Faza 3 — port + adapter auth**: `auth-gateway.*`; migracja `middleware.ts`, `signin/signup/signout`,
   `account/delete.ts`. `deleteAccount` chowa `createAdminClient()` w adapterze.
5. **Faza 4 — weryfikacja**: uruchom grep z 6.1, `npm run lint`, `npm run build`, `npm run test:integration`.

---

## Podsumowanie

Najgorszym przeciekiem architektonicznym w 10xCards jest zależność `@supabase/*`, znana dziś przez 13
plików w czterech warstwach (middleware, UI/`.astro`, API i publiczny typ `App.Locals`), podczas gdy
`ts-fsrs` jest wzorcowo zaizolowana w jednym module `src/lib/srs.ts`, który wprost deklaruje bycie
jedynym właścicielem swojej biblioteki. Rozjazd intencja-vs-kod jest tu najostrzejszy: zespół potrafi
budować ACL, a mimo to rytuał hydratacji sesji RLS został skopiowany do siedmiu miejsc i awansowany na
„lekcję” w `lessons.md` zamiast schowany za portem, a zapytanie o karty „due” istnieje werbatim w
dwóch warstwach naraz. Najgroźniejsze granice, które przekracza query builder, to warstwa UI (strony
SSR znają semantykę PostgREST o jeden import od wysp React) oraz kontrakt frameworka (`env.d.ts` osadza
typ `User` Supabase w `App.Locals`). Projekt naprawczy wprowadza dwa wąskie porty domenowe —
`FlashcardRepository` i `AuthGateway` — oraz adaptery Supabase jako jedyne miejsce wiedzy o kształcie
zależności, z domenowym value object `AuthUser` zastępującym przeciekający typ biblioteki. Otwarte
pytanie o kontrakt PostgREST (pusty wynik UPDATE = konflikt vs 404) zostaje rozstrzygnięte w adapterze
przez dyskryminowany `ReviewOutcome`, tak że semantyka biblioteki nie wypływa do warstwy API.
Kryterium sukcesu jest weryfikowalne grepem: po refaktorze nazwa pakietu trafia wyłącznie w
`src/lib/supabase.ts` i pliki `*.supabase.ts`, a wymiana dostawcy dotyka tylko adapterów — nie tabel,
API ani UI. Plan realizuje to w pięciu fazach zgodnych z konwencją projektu, z testami integracyjnymi
na dedykowanym chmurowym projekcie TEST.
