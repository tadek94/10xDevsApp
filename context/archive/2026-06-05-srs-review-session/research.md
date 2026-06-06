---
date: 2026-06-05T00:00:00Z
researcher: karczynski_t
git_commit: 59d129810b38084719653050afdc6fba3a071bce
branch: main
repository: 10xDEVS
topic: "Ocena zgodności biblioteki ts-fsrs z codebase 10xCards (przygotowanie do S-03)"
tags: [research, codebase, srs-review-session, ts-fsrs, supabase, cloudflare-workerd, dates]
status: complete
last_updated: 2026-06-05
last_updated_by: karczynski_t
---

# Research: Zgodność `ts-fsrs` z codebase 10xCards (S-03)

**Date**: 2026-06-05T00:00:00Z
**Researcher**: karczynski_t
**Git Commit**: 59d129810b38084719653050afdc6fba3a071bce
**Branch**: main
**Repository**: 10xDEVS

## Research Question

Ocena zgodności biblioteki `ts-fsrs` (udokumentowanej w `context/changes/srs-review-session/ts-fsrs-api-docs.md`) z naszym żywym codebase — jako wewnętrzne badanie poprzedzające `/10x-plan srs-review-session` (slice S-03 z `context/foundation/roadmap.md`, PRD FR-009/FR-010). Zakres ustalony z użytkownikiem: **werdykt zgodności + szkic integracji** (proponowane kolumny migracji i kształt warstwy serwisowej), skupiony wyłącznie na `ts-fsrs` (wybór biblioteki już rozstrzygnięty w `external-research.md`).

## Summary

**Werdykt: GO — `ts-fsrs` jest zgodny z codebase na wszystkich czterech badanych wymiarach.** Trzy wymiary są bezfrykcyjne, jeden (obsługa dat) wymaga świadomej warstwy konwersji, którą można zamknąć w serwisie.

| Wymiar | Werdykt | Uzasadnienie (skrót) |
|---|---|---|
| **Schemat / migracja** | ✅ Czysta karta | Tabela `flashcards` ma tylko pola treści; zero kolumn SRS. Ustalony wzorzec migracji (naming, RLS per-operacja, GRANT, UTC, trigger `updated_at`) gotowy do rozszerzenia. |
| **Warstwa serwis / API** | ✅ Wzorzec gotowy | Brak klas serwisowych — cienkie funkcje w `src/lib/` + inline-queries w trasach API. Powtarzalny wzorzec: `getSession()` → zod → mutacja → zwrot pełnego rekordu. SRS wpina się jako nowy serwis + 2 trasy. |
| **Runtime / build (workerd)** | ✅ Bezfrykcyjnie | `type:module`, ESM-first, `nodejs_compat`, brak externals; precedens `openai` w `src/lib/ai.ts`. ts-fsrs pure-JS, zero zależności, <1 ms CPU/kartę. Zero zmian w configu. |
| **Obsługa dat** | ⚠️ Zarządzalna frykcja | ts-fsrs operuje obiektami `Date`; nasza konwencja to UTC + `formatDate()` + TIMESTAMPTZ jako stringi ISO. Wymaga granicy konwersji `Date ↔ ISO` w serwisie — nie zmiany reguł. |

Wniosek: nic w codebase nie blokuje `ts-fsrs`. Główny realny koszt to (a) nowa migracja SRS rozszerzająca `flashcards`, (b) dyscyplina konwersji dat na granicy serwisu, (c) backfill stanu SRS dla istniejących kart sprzed S-03.

## Detailed Findings

### Wymiar 1 — Schemat bazy i migracja

**Istniejąca tabela `flashcards`** (`supabase/migrations/20260528000000_create_flashcards.sql:2-9`):
```sql
CREATE TABLE flashcards (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  front      TEXT        NOT NULL,
  back       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
```
- Trigger auto-`updated_at` (`...create_flashcards.sql:12-23`) via `update_updated_at_column()`.
- RLS włączone, **4 polityki per-operacja** dla roli `authenticated` (`...create_flashcards.sql:27-46`).
- **GRANT w osobnej migracji** (`supabase/migrations/20260601000000_grant_flashcards_permissions.sql:1`) — zgodnie z lekcją "Supabase Migrations: Always Include Explicit GRANTs" (`lessons.md:14-19`).
- **Zero kolumn SRS** w całym `src/` i `supabase/` (grep za `due/stability/difficulty/state/reps/lapses/last_review/interval/ease_factor` → 0 trafień). Czysta karta, zgodnie z odroczeniem w `context/archive/2026-05-28-db-schema/plan.md:29`.

**Typy** (`src/types.ts:1-12`): ręcznie pisane (brak `database.types.ts`, brak generacji z CLI):
```typescript
export interface Flashcard { id, user_id, front, back, created_at: string, updated_at: string }
export type FlashcardInsert = Pick<Flashcard, "front" | "back">;
export type FlashcardUpdate = Partial<Pick<Flashcard, "front" | "back">>;
```
Timestampy są typowane jako `string` (ISO), nie `Date` — istotne dla wymiaru dat.

**Naming migracji**: `YYYYMMDDHHmmss_short_description.sql` (CLAUDE.md:12; dwa przykłady w użyciu).

### Wymiar 2 — Warstwa serwisowa i punkty integracji API

- **Brak dedykowanej warstwy serwisowej / klas.** Jest fabryka klienta `createClient(requestHeaders, cookies) → SupabaseClient | null` (`src/lib/supabase.ts:5-24`); zapytania do flashcards są inline w trasach API.
- **Trasy flashcards** (`src/pages/api/flashcards/`):
  - `index.ts` — `POST`, `prerender=false` (`:5`), zod `SaveCardsSchema` (`:7-17`, array 1–15 kart), zwraca **pełne rekordy** `{saved, cards}` z `.select("id, front, back, created_at")` (`:54,:62`).
  - `[id].ts` — `PATCH` (zod front/back `:9-12`, zwraca `{card: data[0]}` `:65`) i `DELETE` (zwraca tylko `{deleted: id}` `:100`).
  - `generate.ts` — `POST` generacji AI (zod `text` 1–10000), zwraca niezapisane karty.
- **Hydracja sesji**: każda mutacja wywołuje `await supabase.auth.getSession()` przed zapytaniem do tabeli RLS (`index.ts:43-46`, `[id].ts:42-45`, `[id].ts:84-86`) — zgodnie z lekcją `lessons.md:28-33`.
- **Auth**: middleware waliduje `getUser()` raz i ustawia `context.locals.user` (`src/middleware.ts:12-13`); trasy czytają `context.locals.user`, zwracają 401 przy braku, wstawiają `user_id: user.id`.
- **Wzorzec "zwróć pełny rekord"** potwierdzony (`lessons.md:36-40`) — POST/PATCH zwracają komplet pól pod optymistyczny UI.
- **Brak istniejącego pojęcia "session"/"review"/"srs"** w `src/` — czysty grunt pod nowy serwis.

### Wymiar 3 — Runtime, build, zależności (Cloudflare workerd)

**Werdykt: zero frykcji, zero zmian w configu.**
- `package.json:3` — `"type": "module"` (ESM-first). Precedensy dual-build bundlowane bez specjalnej obsługi: `openai@^6` (`:30`), `@supabase/ssr@^0.10` (`:21`).
- `astro.config.mjs` — `output:"server"` (`:11`), `adapter: cloudflare({ imageService: "passthrough" })` (`:16`), **brak `vite.ssr.external`/`noExternal`** → wszystkie pakiety npm bundlują się do workera domyślnie.
- `tsconfig.json` — `extends astro/tsconfigs/strict` → `module/target: ESNext`, `moduleResolution: Bundler`, `verbatimModuleSyntax`. Alias `@/*` (`:10`).
- `wrangler.jsonc` — `compatibility_date: "2026-05-08"` (`:5`), `compatibility_flags: ["nodejs_compat"]` (`:6`). ts-fsrs nie używa API Node, więc flaga jest neutralna.
- `.nvmrc` = `22.14.0`; ts-fsrs `engines: node >=20` → spełnione. `engines` to deklaracja, nie zależność runtime.
- **Precedens integracji biblioteki 3rd-party**: `src/lib/ai.ts` importuje `openai` bezpośrednio, bez dyrektyw vite/wrangler. ts-fsrs (pure-TS, zero deps) wpina się identycznie lub prościej.
- **CPU/pamięć**: arytmetyka FSRS <1 ms i <1 MiB na kartę → bezpiecznie nawet na free tier (limit 50ms free / 30s paid z `lessons.md`/`infrastructure.md`). ⚠️ Uwaga: **NIE** instalować opcjonalnego optymalizatora `@open-spaced-repetition/binding` (Rust/WASI) — niepotrzebny w MVP, domyślne wagi działają out-of-the-box (`external-research.md:31`).

### Wymiar 4 — Obsługa dat (jedyna realna frykcja)

- **Reguła** (CLAUDE.md:19-22): zawsze UTC, zawsze `formatDate()`, nie używać `new Date().toISOString()`.
- **`formatDate()` to dosłownie wrapper na `toISOString()`** (`src/lib/utils.ts:8-10`):
  ```typescript
  export function formatDate(date: Date): string { return date.toISOString(); }
  ```
  Reguła zakazuje surowego wywołania, ale wrapper jest dozwoloną i jedyną poprawną drogą. Wejście to `Date`, wyjście to string ISO (UTC).
- **Przepływ dat dziś**: Postgres `TIMESTAMPTZ` → Supabase zwraca **string ISO** → `src/types.ts` typuje jako `string` → przekazywane przez propsy React; `created_at` **nigdzie nie jest renderowane** (`FlashcardItem.tsx:7-12`), więc obecnie zero kodu łamie regułę (grep: 0 naruszeń w kodzie produkcyjnym).
- **Konflikt z ts-fsrs**: `Card.due` i `Card.last_review` to obiekty `Date`; `scheduler.next(card, new Date(), rating)` przyjmuje `Date`. Dokumentacja ts-fsrs (`ts-fsrs-api-docs.md:51-62`) pokazuje `afterHandler` konwertujący `Date → getTime()` (epoch ms) pod zapis.
- **Wniosek**: potrzebna **granica konwersji `Date ↔ string ISO`** zlokalizowana w serwisie SRS. Obiekty `Date` nie powinny wyciekać do stanu React ani do propsów — komponenty dostają stringi (i ewentualnie renderują przez `formatDate`). To dyscyplina, nie zmiana reguł.

**UI**: wyspy React montowane przez `client:load` z propsami liczonymi w Astro SSR (`src/pages/flashcards.astro:42`); brak katalogu `src/components/hooks/` (hooki inline w komponentach). shadcn/ui zainstalowane: tylko `button.tsx` i `textarea.tsx` — **brak `card`, `dialog`, `input`, radio/toggle** potrzebnych do UI sesji powtórek; trzeba doinstalować (`npx shadcn@latest add ...`).

## Szkic integracji (zakres: zgodność + szkic)

> Propozycja kierunkowa pod `/10x-plan` — nie zatwierdzony kontrakt. Mapuje ustalenia na konkretne pliki.

### A. Migracja SRS (rozszerzenie `flashcards`)

Nowa migracja `YYYYMMDDHHmmss_add_srs_fields.sql` dodająca kolumny FSRS do `flashcards` (mapowanie pól Card → kolumny):

| Pole ts-fsrs | Kolumna | Typ Postgres | Uwagi |
|---|---|---|---|
| `due` | `srs_due` | `TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())` | klucz sortowania sesji; nowa karta = due teraz → od razu wymagalna |
| `stability` | `srs_stability` | `DOUBLE PRECISION NOT NULL DEFAULT 0` | |
| `difficulty` | `srs_difficulty` | `DOUBLE PRECISION NOT NULL DEFAULT 0` | |
| `elapsed_days` | `srs_elapsed_days` | `INTEGER NOT NULL DEFAULT 0` | |
| `scheduled_days` | `srs_scheduled_days` | `INTEGER NOT NULL DEFAULT 0` | |
| `reps` | `srs_reps` | `INTEGER NOT NULL DEFAULT 0` | |
| `lapses` | `srs_lapses` | `INTEGER NOT NULL DEFAULT 0` | |
| `state` | `srs_state` | `SMALLINT NOT NULL DEFAULT 0` | enum: New=0/Learning=1/Review=2/Relearning=3 |
| `last_review` | `srs_last_review` | `TIMESTAMPTZ NULL` | null dla niereviewed |

Decyzje do podjęcia w planie:
- **TIMESTAMPTZ vs BIGINT (epoch ms)** dla `srs_due`/`srs_last_review`. Rekomendacja research: **TIMESTAMPTZ** (idiom Postgres, spójność z istniejącymi `created_at/updated_at`, łatwiejszy debug, naturalne `ORDER BY`). Koszt: konwersja ISO-string ↔ `Date` w serwisie. Alternatywa BIGINT to dosłowny default dokumentacji ts-fsrs (`getTime()`), ale rozjeżdża się z konwencją tabeli.
- **GRANT**: istniejący GRANT na poziomie tabeli (`...grant_flashcards_permissions.sql`) obejmuje nowe kolumny — nie trzeba ponawiać. **RLS** też obejmuje (polityki filtrują po `user_id`, nie po kolumnach). Zweryfikować w planie, ale dodanie kolumn do istniejącej tabeli nie wymaga nowych polityk.
- **Backfill**: istniejące karty (z S-01/S-02) dostaną defaulty kolumn → `srs_state=0`, `srs_due=now` → traktowane jak nowe karty FSRS. Alternatywa: serwis traktuje brakujący/zerowy stan jako `createEmptyCard()`. Do rozstrzygnięcia w planie.
- **Indeks**: rozważyć `INDEX (user_id, srs_due)` pod zapytanie "due cards".

### B. Warstwa serwisowa — `src/lib/srs.ts`

Cienki moduł funkcyjny (wzorzec jak `src/lib/ai.ts` / `src/lib/supabase.ts`, **nie klasa**), właściciel granicy konwersji dat:
- `getScheduler()` → `fsrs()` (domyślne wagi, bez optymalizatora).
- `toCard(row)` → mapuje wiersz Supabase (stringi ISO) na ts-fsrs `Card` (hydratacja `Date` z `srs_due`/`srs_last_review`).
- `fromCard(card)` → mapuje `Card` z powrotem na kolumny do zapisu (serializacja `Date → ISO`).
- `review(row, rating, now)` → `scheduler.next(toCard(row), now, rating)` → zwraca pola SRS do `UPDATE`.
- Mapowanie `Rating`: `again/hard/good/easy` → `Rating.Again(1)/Hard(2)/Good(3)/Easy(4)`.

### C. Trasy API (mirror istniejących wzorców)

- **`GET src/pages/api/flashcards/due.ts`** (mirror `index.ts` GET-style): `prerender=false`, `getSession()`, query `.select(...).lte('srs_due', now).order('srs_due', { ascending: true })`, zwraca pełne karty.
- **`POST src/pages/api/flashcards/[id]/review.ts`** (mirror `[id].ts` PATCH): zod `{ rating: z.enum(['again','hard','good','easy']) }`, `getSession()`, pobierz wiersz → `srs.review(...)` → `.update({...srs_fields}).select(...)` → zwróć **pełny rekord** (zgodnie z `lessons.md:36-40`).

### D. UI sesji powtórek

- Doinstalować shadcn: `card`, `dialog` (tryb pełnoekranowy sesji), przyciski ocen (4× `button` lub `toggle-group`).
- Wyspa React `client:load` na nowej stronie `src/pages/review.astro` (dodać `/review` do `PROTECTED_ROUTES` w `src/middleware.ts`).
- Rozważyć pierwszy hook w `src/components/hooks/` (np. `useReviewSession.ts`) — katalog jeszcze nie istnieje, CLAUDE.md zaleca tę lokalizację.
- Daty SRS NIE wyciekają jako `Date` do komponentów — propsy dostają stringi; render przez `formatDate` jeśli w ogóle pokazywane.

## Code References

- `supabase/migrations/20260528000000_create_flashcards.sql:2-46` — tabela `flashcards`, trigger `updated_at`, RLS per-operacja.
- `supabase/migrations/20260601000000_grant_flashcards_permissions.sql:1` — GRANT na poziomie tabeli (obejmie nowe kolumny SRS).
- `src/types.ts:1-12` — `Flashcard`/`FlashcardInsert`/`FlashcardUpdate`; timestampy jako `string`.
- `src/lib/supabase.ts:5-24` — fabryka klienta SSR (wzorzec modułu funkcyjnego).
- `src/lib/ai.ts:1-9` — precedens integracji biblioteki 3rd-party (openai) bez specjalnej obsługi build.
- `src/lib/utils.ts:4-10` — `cn()` i `formatDate()` (wrapper `toISOString`).
- `src/pages/api/flashcards/index.ts:5,7-17,43-46,54,62` — prerender, zod, hydracja sesji, zwrot pełnych rekordów.
- `src/pages/api/flashcards/[id].ts:9-12,42-45,65,84-86,100` — PATCH/DELETE, hydracja, kontrakty zwrotu.
- `src/middleware.ts:4,12-13` — `PROTECTED_ROUTES`, `context.locals.user`.
- `src/pages/flashcards.astro:18-22,42` — SSR fetch + montaż wyspy `client:load`.
- `src/components/flashcards/FlashcardItem.tsx:7-12` — `created_at` przekazywany, nierenderowany.
- `package.json:3,21,30` — `type:module`, precedensy dual-build.
- `astro.config.mjs:11,16,17-23` — output server, adapter cloudflare, schema astro:env.
- `wrangler.jsonc:5,6` — compatibility_date, `nodejs_compat`.
- `tsconfig.json:2,10` — strict ESM, alias `@/*`.

## Architecture Insights

- **Konwencja "cienkie funkcje + inline queries"** — projekt nie ma warstwy repozytoriów/serwisów klasowych; logikę trzyma w trasach API z pomocniczymi modułami w `src/lib/`. SRS powinien podążać za tym (moduł `src/lib/srs.ts`), nie wprowadzać nowego paradygmatu.
- **Trzy niezależne warunki poprawnego zapisu pod RLS** są już ugruntowane w lekcjach i kodzie: (1) GRANT na tabeli, (2) `getSession()` hydratacja JWT, (3) polityki per-operacja. Nowy endpoint review musi spełnić wszystkie trzy — kopiuje istniejący wzorzec.
- **Granica serializacji jest dziś trywialna** (Supabase zwraca stringi, komponenty trzymają stringi). ts-fsrs ją komplikuje wprowadzając `Date` — dlatego konwersja musi być scentralizowana w jednym module (`src/lib/srs.ts`), inaczej `Date` rozlezie się po kodzie i zacznie kolidować z regułą `formatDate`.
- **Brak generacji typów z CLI** oznacza, że migracja SRS wymaga ręcznej aktualizacji `src/types.ts` (rozszerzenie `Flashcard` o pola SRS) w tym samym kroku.

## Historical Context (from prior changes)

- `context/changes/srs-review-session/external-research.md` — rozstrzyga wybór biblioteki na `ts-fsrs` (zero deps, edge-safe, FSRS v4.5/5/6); ostrzega przed instalacją optymalizatora Rust/WASI; rekomenduje walidację zod na granicy.
- `context/changes/srs-review-session/ts-fsrs-api-docs.md` — pobrane Context7 API docs (Card shape, `repeat`/`next`, enumy Rating/State, `afterHandler` do serializacji).
- `context/archive/2026-05-28-db-schema/plan.md:29` — pola SRS świadomie odroczone do S-03; tabela `flashcards` zaprojektowana jako minimalna.
- `context/foundation/lessons.md:14-19` (GRANT), `:28-33` (hydracja `getSession()`), `:36-40` (zwrot pełnego rekordu) — wszystkie trzy mają bezpośrednie zastosowanie do nowego endpointu review.
- `context/foundation/lessons.md:5-12` + `infrastructure.md` — limity workerd i ryzyko CJS; ts-fsrs (zero deps, pure-JS) je neutralizuje.

## Related Research

- `context/changes/srs-review-session/external-research.md` — zewnętrzne badanie wyboru biblioteki (exa.ai).
- `context/changes/srs-review-session/ts-fsrs-api-docs.md` — referencja API ts-fsrs (Context7).

## Open Questions

1. **TIMESTAMPTZ vs BIGINT** dla `srs_due`/`srs_last_review` — research rekomenduje TIMESTAMPTZ; decyzja w `/10x-plan`.
2. **Strategia backfill** stanu SRS dla kart sprzed S-03 — defaulty kolumn vs `createEmptyCard()` w serwisie przy null-stanie.
3. **Granularność enumów w schemacie** — `srs_state` jako `SMALLINT` (0–3) vs CHECK constraint vs enum Postgres. Plan-phase.
4. **Zakres sesji** (FR-009/FR-010): czy sesja kończy się gdy brak kart wymagalnych, czy ma limit dzienny / "nauka z wyprzedzeniem"? — produktowe, do potwierdzenia w planie.
5. **Wersjonowanie parametrów FSRS** — czy zapisywać wersję wag (na wypadek przyszłej zmiany algorytmu)? Opcjonalne, niskie ryzyko dla MVP.
