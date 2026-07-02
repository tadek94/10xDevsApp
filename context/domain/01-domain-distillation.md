---
title: Domain Distillation — 10xCards
created: 2026-07-02
type: domain-distillation
---

# Destylacja domeny — 10xCards

> Produkt tego dokumentu to **mapa domeny**, nie kod. Nazwy bytów, reguł i granic zostały
> odkryte z dokumentów źródłowych i kodu, nie założone z góry. Każde twierdzenie jest
> udokumentowane cytatem `plik:linia`.

## KROK 0 — Kontekst projektu

**Dokumenty źródłowe (znalezione i przeczytane):**

- `context/foundation/prd.md` — pełny PRD (wizja, success criteria, FR-001…FR-011, non-goals, open questions). Główne źródło wiedzy domenowej.
- `README.md` — opis produktu i stacku (`README.md:5` — jednozdaniowa esencja domeny).
- `context/foundation/tech-stack.md` — decyzje technologiczne (`has_ai: true`, `has_auth: true`).
- `context/foundation/prd.md:1-16` — frontmatter: `context_type: greenfield`, `product_type: web-app`, `mvp_weeks: 3`, skala mała.

**Materiał pomocniczy (istnieje, nie stanowił źródła wymagań):** `context/foundation/roadmap.md`, `shape-notes.md`, `test-plan.md`, `mvp-check.md`. Katalogi `context/map/` oraz `astro-legacy-analysis/` (large-scale/legacy) świadomie pominięte — dotyczą innej analizy.

**Stack i struktura (gdzie żyje logika biznesowa):**

- Framework: Astro v6 (SSR, `output: "server"`) + React 19 dla wysp interaktywnych.
- Persystencja: Supabase (Postgres + Auth), RLS jako granica izolacji.
- Warstwy w repo:
  - **API / logika biznesowa** — `src/pages/api/flashcards/*` i `src/pages/api/account/delete.ts` (handlery `GET/POST/PATCH/DELETE`, walidacja zod).
  - **Domena / algorytm** — `src/lib/srs.ts` (jedyny prawdziwy „serwis domenowy": FSRS + granica Date↔ISO), `src/lib/ai.ts` (klient LLM).
  - **Persystencja / niezmienniki DB** — `supabase/migrations/*` (schemat, RLS, CHECK, trigger, cascade).
  - **UI / stan sesji** — `src/components/flashcards/*` (React), `src/pages/*.astro` (server load).
  - **Typy współdzielone** — `src/types.ts`.

**Ograniczenie:** Dokumenty wymagań istnieją i są bogate, więc destylacja opiera się głównie na PRD. Brakuje natomiast **osobnego modelu domenowego w kodzie** — nie ma warstwy encji/agregatów z niezmiennikami; logika biznesowa jest rozproszona po handlerach API. To samo w sobie jest kluczowym wnioskiem (patrz KROK 4 i 5).

---

## KROK 1 — Ubiquitous Language

| Pojęcie | Definicja | Cytat źródłowy (dokument) | Życie w kodzie |
|---|---|---|---|
| **Flashcard / Fiszka** | Para pytanie–odpowiedź (front + back) należąca do jednego użytkownika, jednostka wiedzy do zapamiętania. | „a set of question-answer flashcard pairs, one per extractable fact" `prd.md:131` | `src/types.ts:1-19` (`interface Flashcard`); tabela `supabase/migrations/20260528000000_create_flashcards.sql:2-9` |
| **Front / Back (Przód / Tył)** | Pytanie/prompt i odpowiedź (1–3 zdania). | „Front: concise question… Back: clear, accurate answer (1–3 sentences)" `prd.md` (prompt gen.) / `generate.ts:20-22` | kolumny `front TEXT NOT NULL, back TEXT NOT NULL` `…create_flashcards.sql:5-6` |
| **Generacja AI (Suggestion)** | Proces przekształcenia wklejonego tekstu w propozycje fiszek przez LLM. | FR-003 „paste source text and trigger AI-generated flashcard suggestions" `prd.md:82` | `src/pages/api/flashcards/generate.ts:49-106`; wyspa `FlashcardGenerator.tsx` |
| **Source text (Tekst źródłowy)** | Surowy tekst wklejony przez użytkownika; wejście generacji, świadomie **nieprzechowywane**. | „raw text the user pastes" `prd.md:129`; Open Question #1 (retencja) `prd.md:152` | walidowany `generate.ts:7-9,66-70`; nigdzie nie zapisywany do DB — **BRAK persystencji** (świadomie) |
| **Accept / Edit / Discard (Akceptacja/Edycja/Odrzucenie)** | Decyzja użytkownika o każdej propozycji przed zapisem — sedno metryki jakości. | FR-004 „accept, edit, or discard each AI-generated flashcard suggestion before saving" `prd.md:86` | stan klienta `FlashcardGenerator.tsx:9-17,40-41,89`; **tylko w pamięci wyspy**, nie utrwalane jako fakt |
| **Manual creation (Ręczne tworzenie)** | Ręczne dodanie fiszki (front+back) — siatka bezpieczeństwa gdy AI zawiedzie. | FR-005 „create a flashcard manually" `prd.md:90` | `FlashcardCollection.tsx:30-62` → `POST /api/flashcards` `index.ts:19-63` |
| **Collection (Kolekcja)** | Płaska lista zapisanych fiszek użytkownika. | FR-006 „view their saved flashcard collection (flat list)" `prd.md:95` | `flashcards.astro:14-29` (SELECT server-side), `FlashcardCollection.tsx` |
| **Spaced Repetition / Review Session (Sesja powtórek)** | Przegląd kart „due" z oceną recall; napędza harmonogram. | FR-009 „start a spaced repetition review session" `prd.md:108` | `review.astro:13-29`; `ReviewSession.tsx:35-123`; endpoint `[id]/review.ts` |
| **Rating / Grade (Ocena: again/hard/good/easy)** | Cztery oceny FSRS podawane przy powtórce. | FR-010 „ready-made spaced repetition algorithm" `prd.md:112` | `ReviewRating` `types.ts:26`; `RATING_MAP` `srs.ts:12-17` |
| **SRS state (Stan powtórek)** | Kolumny FSRS: due, stability, difficulty, reps, lapses, state (0–3), last_review. | „applies a ready-made spaced repetition algorithm to schedule future reviews" `prd.md:112` | `types.ts:8-18`; migracja `…add_srs_fields.sql:10-19`; serwis `srs.ts:24-59` |
| **Due card (Karta do powtórki)** | Karta, której `srs_due <= now`. | „the app decides which cards are due based on their past recall performance" `prd.md:133` | `due.ts:25-27`; `review.astro:18-22` |
| **Review history (Historia powtórek)** | Dane, które przy usunięciu konta muszą zniknąć razem z fiszkami. | FR-011 „all associated data (flashcards + review history)" `prd.md:117` | **BRAK osobnego bytu** — nie ma tabeli/logu powtórek; historia zredukowana do bieżących kolumn `srs_*` nadpisywanych w miejscu (`review.ts:65-75`) |
| **Account / User** | Właściciel danych; email+hasło; płaski model ról. | „email + password… users own their decks" `prd.md:137-139` | `auth.users` (Supabase); `context.locals.user` `middleware.ts:12`; FK `user_id` `…create_flashcards.sql:4` |
| **Account deletion (Prawo do bycia zapomnianym)** | Trwałe, nieodwracalne usunięcie konta i wszystkich danych (RODO Art. 17). | FR-011 `prd.md:117-118` | `api/account/delete.ts:19` (`admin.deleteUser`) + `ON DELETE CASCADE` `…create_flashcards.sql:4` |
| **Per-user isolation (Izolacja danych)** | Brak wycieku danych między kontami „under any request path". | NFR `prd.md:123` | polityki RLS `…create_flashcards.sql:24-46`; `auth.getSession()` przed każdym zapytaniem |
| **Acceptance rate / Edit rate** | Metryki sukcesu: 75% kart akceptowanych, ≤25% edytowanych, 75% kart z AI. | Success Criteria `prd.md:35-36,48` | **BRAK w kodzie i schemacie** — brak kolumn provenance/edited/accepted (patrz KROK 4) |

---

## KROK 2 — Klasyfikacja subdomen

| Obszar | Kategoria | Uzasadnienie (odniesienie do celów produktu) |
|---|---|---|
| **Generacja AI z tekstu źródłowego** (`ai.ts`, `generate.ts`) | **Core** | To jedyny powód istnienia produktu: „the insight that makes this worth building: LLMs can now generate flashcards good enough to review and keep" `prd.md:22`. Cała hipoteza MVP (`prd.md:84`) i obie metryki główne wiszą na jakości generacji. |
| **Pętla Accept / Edit / Discard przed zapisem** (`FlashcardGenerator.tsx`) | **Core** | Bez pre-save review metryka akceptacji „carries no information" — FR-004 „Pre-save review is essential for the acceptance metric to be meaningful" `prd.md:88`. To mechanizm, który zamienia jakość AI w mierzalny sygnał. |
| **Zarządzanie fiszkami (CRUD, kolekcja, edycja, delete)** | **Supporting** | „table stakes" `prd.md:97`; konieczne, ale nie stanowi przewagi. Wspiera rdzeń (siatka bezpieczeństwa FR-005, trwałość edycji jako guardrail `prd.md:52`). |
| **Spaced repetition / SRS scheduling** (`srs.ts`, ts-fsrs) | **Supporting** | Niezbędne dla wartości nauki, ale **świadomie skomodytyzowane**: non-goal „No custom SRS algorithm… uses an established library" `prd.md:145`. Kupione z półki (ts-fsrs), nie budowane jako różnicowanie. |
| **Uwierzytelnianie (sign up/in/out)** | **Generic** | Standardowy email+hasło, „prerequisite of account-based persistence" `prd.md:78`. W całości Supabase Auth. |
| **Izolacja danych / RLS** | **Generic** | Wymóg bezpieczeństwa `prd.md:123`, realizowany wzorcowym mechanizmem Postgres RLS — nie jest produktowym różnicowaniem. |
| **Usuwanie konta / RODO Art. 17** | **Generic** | Zgodność prawna `prd.md:117`; realizowana wbudowanym cascade + admin API, nie własną logiką domenową. |

**Wniosek KROK 2:** Rdzeń to **generacja AI + pętla akceptacji**. Reszta (SRS, CRUD, auth) jest świadomie kupowana z półki lub traktowana jako table-stakes. Największa uwaga inżynierska powinna iść tam, gdzie mierzy się jakość rdzenia — a właśnie tam kod jest najsłabszy (KROK 4).

---

## KROK 3 — Kandydaci na agregaty i ich niezmienniki

### Agregat #1 — **Flashcard** (jedyny trwały byt domenowy)

| Niezmiennik | Cytat źródłowy | Status w kodzie |
|---|---|---|
| Fiszka należy zawsze do dokładnie jednego użytkownika; nie istnieje bez właściciela. | izolacja per-user `prd.md:123` | **Egzekwowany** — `user_id UUID NOT NULL REFERENCES auth.users` `…create_flashcards.sql:4` + RLS `WITH CHECK (auth.uid() = user_id)` `:32-35` |
| Front i back są niepuste. | „front + back" `prd.md:60` | **Egzekwowany dwutorowo** — DB `NOT NULL` `:5-6`; zod `.trim().min(1)` (`index.ts:11-12`, `[id].ts:10-12`). Uwaga: **brak górnego limitu** długości przy zapisie. |
| Stan SRS jest zawsze poprawny (state ∈ 0..3, pola liczbowe). | „srs_state: 0=New…3=Relearning" `types.ts:9` | **Egzekwowany** — `CHECK (srs_state BETWEEN 0 AND 3)` `…add_srs_fields.sql:18`; defaulty = `createEmptyCard()` |
| Przejście stanu SRS liczy wyłącznie zatwierdzony algorytm (FSRS), przez jedną granicę Date↔ISO. | FR-010 `prd.md:112` | **Egzekwowany/zadeklarowany** — `srs.ts` jest „single owner of the FSRS algorithm" `srs.ts:5-6`; Date nie wycieka poza moduł |
| `srs_reps` rośnie monotonicznie; równoległe powtórki tej samej karty są serializowane. | (reguła wyprowadzona z „scheduling based on past recall" `prd.md:133`) | **Egzekwowany** — optimistic concurrency guard `.eq("srs_reps", rows[0].srs_reps)` → 409 `review.ts:70-87` |
| Edycja fiszki przeżywa reload (brak cichej utraty danych). | Guardrail `prd.md:52` | **Egzekwowany** — PATCH utrwala do DB `[id].ts:47-51`, kolekcja ładowana server-side `flashcards.astro:19-28` |
| **Fiszka pamięta swoje pochodzenie (AI vs manual) i czy była edytowana przed akceptacją.** | Success Criteria: „75% created via AI", „edits ≤25%" `prd.md:36,48` | **IGNOROWANY** — schemat nie ma żadnej kolumny provenance/edited; niezmiennik nie istnieje w modelu (patrz KROK 4, rozjazd #1) |

### Agregat #2 (kandydat) — **GenerationBatch / zestaw sugestii**

- Niezmiennik: „At least one card is generated for any text input of ≥ 50 words" `prd.md:64`.
- Status: **częściowo / ephemeryczny.** Reguła ≥50 słów egzekwowana (`generate.ts:67-70`), limit 15 kart (`:96`). Ale zestaw sugestii **nigdy nie jest utrwalany jako całość** — żyje tylko w stanie React `SuggestionCard[]` (`FlashcardGenerator.tsx:35`). „≥1 karta" nie jest gwarantowane: przy pustej odpowiedzi AI zwracany jest 422 „No cards generated" (`:98-99`). To granica transakcyjna tylko po stronie klienta — nie agregat trwały.

### Agregat #3 (kandydat) — **Account / User**

- Niezmiennik: usunięcie konta kasuje wszystkie powiązane dane bez śladu (RODO) `prd.md:117-118`.
- Status: **Egzekwowany, ale poza domeną aplikacji** — `admin.deleteUser` (`delete.ts:19`) + `ON DELETE CASCADE` (`…create_flashcards.sql:4`). Byt żyje w `auth.users` (Supabase), aplikacja go nie modeluje.

### (Nie-agregat) — **ReviewSession**

- Ephemeryczna, wyłącznie po stronie klienta: indeks nad listą kart due (`ReviewSession.tsx:36`, `index >= total`). Brak trwałego bytu „sesji" i brak logu powtórek.

---

## KROK 4 — Rozjazdy MODEL vs KOD

| # | Dokument mówi (X) | Kod robi (Y) | Dowód (plik:linia) |
|---|---|---|---|
| **1** ⭐ | Sukces = „75% kart tworzonych przez AI" i „edycje ≤25%" — pochodzenie i edycja karty to **mierzone fakty domenowe**. `prd.md:36,48` | Schemat fiszki nie ma **żadnej** kolumny `source`/`origin`/`ai_generated` ani `edited`/`accepted_at`. Akceptacja i edycja żyją tylko w stanie React i giną przy zapisie — **obie metryki główne są niemierzalne**. | tabela bez provenance `…create_flashcards.sql:2-9`; `…add_srs_fields.sql:10-19`; zapis odrzuca metadane `index.ts:48-54`; stan ulotny `FlashcardGenerator.tsx:9-17,89` |
| **2** | FR-011: usuwane są „flashcards + **review history**" — historia powtórek to osobny byt. `prd.md:117` | Nie istnieje tabela/log powtórek. Każda ocena **nadpisuje w miejscu** kolumny `srs_*`; historia jest tracona przy każdej powtórce, nie tylko przy usunięciu konta. | brak tabeli reviews (tylko 3 migracje); mutacja in-place `review.ts:65-75` |
| **3** | AC: „At least one card is generated for any text input of ≥ 50 words". `prd.md:64` | Gwarancja ≥50 słów jest, ale przy pustej/niepoprawnej odpowiedzi AI zwracane jest 422 „No cards generated" — **brak gwarancji ≥1 karty**. | `generate.ts:84-85,98-99` |
| **4** | Niezmiennik „front/back niepuste" ma jedno miejsce prawdy. | Reguła długości/niepustości zdublowana: próg ≥50 słów w serwerze **i** kliencie; brak wspólnego modelu → ryzyko dryfu. | serwer `generate.ts:67-70` vs klient `FlashcardGenerator.tsx:39` |
| **5** | „No silent data loss… edit must survive reload" jako twardy guardrail domenowy. `prd.md:52` | Spełnione, ale **nieujęte w warstwie domeny** — trwałość zależy od tego, że każdy handler pamięta `auth.getSession()` przed zapytaniem; pominięcie = cichy błąd RLS. Wiedza rozproszona po 5 handlerach zamiast w jednym agregacie. | powtarzany wzorzec `index.ts:46`, `[id].ts:45`, `review.ts:49`, `due.ts:20`, `flashcards.astro:18` |
| **6** | Non-goal „No multi-format import — paste-from-text only". `prd.md:146` | Zgodne: wejście to tylko `text` (max 10000 znaków). Brak rozjazdu — odnotowane jako potwierdzenie. | `generate.ts:7-9` |
| **7** | FR-009: „may enforce a soft minimum before a full session". `prd.md:110` | Kod tylko **ostrzega** przy <3 kartach, nie wymusza — zgodne z „may" (deklaratywnie, nie egzekwowane). | `ReviewSession.tsx:136-140` |

⭐ = najcenniejszy rozjazd. Wiedza domenowa („co czyni produkt udanym") jest w PRD w pełni artykułowana, a model danych jej **w ogóle nie odwzorowuje**.

---

## KROK 5 — Ranking refaktoru

Uszeregowanie wg **wartości** (jak rdzeniowy jest niezmiennik) × **ryzyka** (jak słabo egzekwowany dziś):

| Ranga | Kandydat / niezmiennik | Wartość | Ryzyko (obecna egzekucja) |
|---|---|---|---|
| **#1** | **Flashcard: provenance + edited** (rozjazd #1) — „karta pamięta, czy pochodzi z AI i czy była edytowana" | **Maksymalna** — to definicja sukcesu MVP (`prd.md:35-36,48`) | **Maksymalne** — zero egzekucji, zero pomiaru; niezmiennik nie istnieje w modelu |
| **#2** | **Review history jako byt** (rozjazd #2) — trwały log ocen | Wysoka — wymagany przez FR-011 i przez sam sens „scheduling based on past recall" | Wysokie — bytu nie ma; dane nadpisywane w miejscu |
| **#3** | **Flashcard jako agregat z jedną granicą persystencji** (rozjazdy #4, #5) — konsolidacja niezmienników front/back + wzorca `getSession()` | Średnia — trwałość i izolacja to guardrails | Średnie — działa, ale wiedza rozproszona po 5 handlerach; podatne na dryf |
| **#4** | **GenerationBatch: gwarancja ≥1 karty** (rozjazd #3) | Średnia — AC US-01 | Niskie/średnie — częściowo egzekwowane (≥50 słów), luka tylko na pustej odpowiedzi AI |

### Rekomendacja #1 do refaktoru

**Wprowadzić na agregacie `Flashcard` pola pochodzenia i edycji** (`source: 'ai' | 'manual'`, `edited_before_accept: boolean` lub `accepted_at`/`edited_at`), utrwalane w momencie zapisu w `POST /api/flashcards`.

**Dlaczego #1:** to jednocześnie **najbardziej rdzeniowy** niezmiennik (obie metryki główne produktu — `prd.md:35-36` — są nim zdefiniowane) i **najsłabiej egzekwowany** (nie istnieje ani w schemacie, ani w kodzie — `…create_flashcards.sql:2-9`, `index.ts:48-54`). Bez niego MVP nie potrafi odpowiedzieć na pytanie, dla którego powstał: „czy AI generuje karty dość dobre, by je zachować?". Każdy inny refaktor optymalizuje mechanikę produktu, którego głównego rezultatu nie da się zmierzyć. Koszt jest mały (kilka kolumn + zapis metadanych w jednym handlerze i wyspie), a odblokowuje cały aparat walidacji hipotezy MVP.

---

## Podsumowanie

Artefakt destyluje domenę 10xCards z PRD i kodu w Ubiquitous Language (16 pojęć z cytatami), klasyfikację subdomen, kandydatów na agregaty z niezmiennikami oraz tabelę rozjazdów model↔kod. Rdzeniem produktu jest **generacja fiszek przez AI wraz z pętlą akceptacji przed zapisem** — to jedyny powód istnienia MVP; SRS, CRUD i auth są świadomie skomodytyzowane (biblioteka ts-fsrs, Supabase). Jedynym trwałym bytem domenowym jest **Flashcard**, i większość jego niezmienników jest solidnie egzekwowana na poziomie DB (RLS, CHECK, FK cascade, optimistic-concurrency na `srs_reps`). Najcenniejszy wniosek to jednak luka: **obie metryki sukcesu produktu — 75% kart z AI i ≤25% edycji — są dziś niemierzalne**, bo model danych nie zapisuje pochodzenia ani faktu edycji fiszki; wiedza domenowa istnieje w pełni w PRD, ale kod jej nie odwzorowuje. Drugorzędnie: „review history" z FR-011 nie ma reprezentacji — oceny nadpisują stan SRS w miejscu, bez logu. Rekomendacja #1 refaktoru to dodanie na agregacie Flashcard pól provenance/edited utrwalanych przy zapisie — najbardziej rdzeniowy i zarazem najsłabiej egzekwowany niezmiennik, tani do wprowadzenia, a odblokowujący walidację hipotezy MVP.
