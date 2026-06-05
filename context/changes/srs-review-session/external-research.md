---
change_id: srs-review-session
type: external-research
topic: Wybór biblioteki SRS (Open Roadmap Question #2)
source: web_search (exa.ai)
created: 2026-06-05
---

# External research: biblioteki SRS dla S-03

> Badanie zewnętrzne (exa.ai) odpowiadające na pytanie "czego użyć?" dla slice S-03.
> Rozstrzyga Open Roadmap Question #2 jako wejście do `/10x-plan srs-review-session`.
> ⚠️ Nie pobrano jeszcze live API docs przez Context7 — to naturalny następny krok przed planowaniem integracji.

## Twarde ograniczenie kompatybilności (z tech-stack.md)

Stack: Astro 6.3.1 + React 19, TypeScript/ESM, npm, **Cloudflare workerd** (edge runtime), Supabase Postgres jako warstwa trwałości.

Wymagania, które biblioteka musi spełnić:
- **Pure JS/TS, zero modułów natywnych** (workerd nie uruchomi native bindings).
- **ESM-capable**, w pełni otypowana.
- **Serializowalny stan** — pola SRS żyją w Postgresie (Supabase), nie w pamięci procesu (workerd jest bezstanowy między requestami; limit CPU 50ms free / 30s paid — patrz lessons.md).

Wszyscy kandydaci poniżej przechodzą ten próg.

## Kandydaci

### ⭐ `ts-fsrs` — rekomendacja (już wskazany w roadmapie)
- **Algorytm:** FSRS v4.5/v5/v6 — nowoczesny, model trójskładnikowy (Difficulty / Stability / Retrievability), trenowany ML na ~700M powtórek.
- **Kompatybilność:** ✅ **zero zależności**, ESM + CJS + UMD, w pełni otypowany. 51.9K pobrań/tydz., MIT, 664★, aktywnie utrzymywany (5.4.x, maj 2026).
- **workerd:** pure JS, działa na edge. `engines: node >=20` to tylko deklaracja, nie zależność runtime — scheduler nie używa wbudowanych modułów Node. ⚠️ **Optimizer** (`@open-spaced-repetition/binding`) to OSOBNY pakiet Rust/WASI — **nie jest potrzebny do MVP** (domyślne wagi działają out-of-the-box). Instalować TYLKO `ts-fsrs`.
- **Stan/schemat:** `Card` jest JSON-serializowalny → mapuje się czysto na kolumny Supabase: `stability`, `difficulty`, `due`, `state`, `reps`, `lapses`, `last_review`.
- **Docs:** mocne (TypeDoc, DeepWiki, README ×3 języki) — agent-friendly. README sam zaleca walidację `zod` na granicy → zgodne z konwencją CLAUDE.md.
- **API (zapamiętane do weryfikacji w Context7):** `createEmptyCard()`, `fsrs(params)` / `new FSRS()`, `scheduler.repeat(card, now)` (podgląd 4 wyników), `scheduler.next(card, now, Rating.Good)` (znana ocena), `Rating` enum (Again/Hard/Good/Easy), `generatorParameters({ request_retention, maximum_interval, enable_fuzz, ... })`.

### `@squeakyrobot/fsrs` / `quanta-fsrs` — FSRS z jawną deklaracją edge
- Oba reklamują gotowość na Cloudflare Workers / Vercel Edge, zero zależności, FSRS v4.5/6.
- ⚠️ **Niedojrzałe** — `@squeakyrobot/fsrs`: 7 pobrań/tydz., 1 wersja; `quanta-fsrs`: 0★, 1 autor, niestandardowa licencja. Traktować jako dowód, że FSRS działa na edge — NIE jako wybór produkcyjny ponad `ts-fsrs`.

### `supermemo` (VienDinhCom) — dojrzały, minimalny SM-2
- **Algorytm:** SuperMemo-2 (klasyczny, jeden ease-factor).
- **Kompatybilność:** ✅ zero zależności, ~12.5KB, czysta funkcja `(item, grade) → item`, TS + ESM/CJS, działa na Workers/Deno/Bun. 332★, 1.8K pobrań/tydz., ostatni push mar 2025.
- **Trade-off:** czysta funkcja bez I/O — trwałość po naszej stronie (pasuje do warstwy serwisowej). Najprostsza dojrzała opcja, jeśli liczy się audytowalność ponad dokładnością.

### `@open-spaced-repetition/sm-2` — oficjalny SM-2
- Z tej samej organizacji co `ts-fsrs`, TS, `Card`/`ReviewLog` JSON-serializowalne. ⚠️ Bardzo nowy, sam deklaruje się jako **unstable** (v0.2.1, 3★). `supermemo` jest dziś bezpieczniejszym wyborem SM-2.

### Opcja zero-biblioteki (drugi kandydat z roadmapy)
- Stały harmonogram (1d→3d→7d): **żadnej zależności** — integer step + kolumna `due_date`. Najniższa złożoność schematu, brak adaptacji per-karta.

## Tabela decyzyjna

| | FSRS (`ts-fsrs`) | SM-2 (`supermemo`) | Stałe interwały |
|---|---|---|---|
| Jakość harmonogramu | Najlepsza (~20-30% mniej powtórek przy tej samej retencji; ~4% vs ~14% błędu predykcji recall vs SM-2) | Przyzwoita, przewidywalna, znana wada "ease hell" | Surowa |
| Pola schematu | Więcej (stability, difficulty, state, reps, lapses, due) | Mniej (ease_factor, interval, repetitions, due) | Minimalne (interval_step, due_date) |
| Dojrzałość / ryzyko | Wysoka / niskie | Wysoka / niskie | Brak zależności / brak ryzyka |
| Kompat. edge | ✅ pure JS | ✅ pure JS | ✅ |

## Rekomendacja

Dla MVP testującego hipotezę generowania AI: **`ts-fsrs`** jest najmocniejszym wyborem — jedyna dojrzała, szeroko adoptowana, bezzależnościowa i edge-bezpieczna biblioteka dająca prawdziwy SRS bez przejmowania odpowiedzialności za poprawność algorytmu; roadmap już ją wskazał. Jedyny koszt to nieco bogatsza migracja SRS (odroczony schemat FR-010).

Fallback: jeśli priorytetem jest lekki, audytowalny schemat — `supermemo` (SM-2).

## Następny krok

Przed `/10x-plan srs-review-session`: pobrać live API docs `ts-fsrs` przez Context7 (`resolve-library-id` → `get-library-docs`), aby potwierdzić aktualny kształt API i zmapowanie pól na migrację Supabase.
