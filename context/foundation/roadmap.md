---
project: "10xCards"
version: 1
status: draft
created: 2026-05-28
updated: 2026-06-06
prd_version: 1
main_goal: speed
top_blocker: capacity
---

# Roadmap: 10xCards

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

10xCards eliminuje barierę między materiałem źródłowym a sesją nauki: użytkownik wkleja tekst, AI generuje fiszki, a on za kilka sekund przechodzi do powtórek zamiast godzinę budować talie ręcznie. Produkt stoi na jednej hipotezie produktowej (ang. *core hypothesis* — założeniu, które MVP weryfikuje): LLM-y generują już fiszki na tyle dobre, żeby je zachować bez masowych korekt. Metryka 75% akceptacji jest bezpośrednim testem tej hipotezy. Cel MVP: zweryfikować ją na pierwszych użytkownikach przed dalszymi inwestycjami.

## North star

**S-03: Pełny flow pierwszej sesji** — zalogowany użytkownik wkleja tekst, AI generuje fiszki, użytkownik akceptuje lub odrzuca każdą z nich, a następnie od razu przechodzi do sesji powtórek metodą spaced repetition. To *gwiazda przewodnia* (ang. *north star*) — najmniejsze end-to-end przejście przez produkt, które, jeśli działa, udowadnia że produkt ma rację bytu; umieszczona jak najwcześniej w kolejności, bo reszta ma wartość tylko jeśli to działa. S-01 jest bezpośrednim krokiem poprzedzającym.

> **Uwaga:** S-01 (pierwsza część gwiazdy) jest `done`. S-03 odblokowany 2026-06-05 — wybór biblioteki SRS (Open Roadmap Question #2) został świadomie odroczony do `/10x-plan srs-review-session` zamiast blokować slice.

## At a glance

| ID   | Change ID            | Outcome (user can …)                                                            | Prerequisites | PRD refs                              | Status   |
|------|----------------------|---------------------------------------------------------------------------------|---------------|---------------------------------------|----------|
| F-01 | db-schema            | (foundation) schemat flashcards + RLS w Supabase                                | —             | NFR, FR-006, FR-007, FR-008           | done     |
| F-02 | openrouter-client    | (foundation) klient OpenRouter skonfigurowany + zmienne env AI                  | —             | FR-003, NFR                           | done     |
| S-01 | ai-generation-flow   | wkleić tekst, zobaczyć sugestie AI, zaakceptować/edytować/odrzucić, zapisać     | F-01, F-02    | US-01, FR-001, FR-002, FR-003, FR-004 | done     |
| S-02 | flashcard-collection | zobaczyć kolekcję, dodać kartę ręcznie, edytować i usunąć z potwierdzeniem      | F-01          | FR-005, FR-006, FR-007, FR-008        | done     |
| S-03 | srs-review-session   | uruchomić sesję powtórek z kartami wg algorytmu SRS                             | F-01, S-01    | FR-009, FR-010                        | done     |
| S-04 | account-deletion     | trwale usunąć konto wraz ze wszystkimi danymi (RODO art. 17)                    | F-01          | FR-011, NFR                           | done     |
| S-05 | ux-polish            | czytelniejszy dashboard z krótkim opisem każdej opcji; drobne poprawki UX       | S-01,S-02,S-03| — (usability)                         | done     |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme               | Chain                              | Note                                                                                      |
|--------|---------------------|------------------------------------|-------------------------------------------------------------------------------------------|
| A      | Gwiazda przewodnia  | `F-01` / `F-02` → `S-01` → `S-03` | Krytyczna ścieżka do pełnego flow; F-01 i F-02 równolegle, S-03 odblokowany (wybór SRS rozstrzygany w planie). |
| B      | Zarządzanie kartami | `S-02`                             | Rozgałęzia się od F-01 (Stream A); startuje po F-01, niezależnie od F-02 i S-01.         |
| C      | Cykl życia konta    | `S-04`                             | Domyka cykl konta (tworzenie istnieje od FR-001). Zależny od F-01 + istniejącego auth; niezależny od pozostałych slice'ów. |
| D      | Dopracowanie / UX   | `S-05`                             | Polish istniejących ekranów. Zależny od S-01/S-02/S-03 (opisuje ich opcje); niezależny od S-04 — może iść równolegle. |

## Baseline

What's already in place in the codebase as of `2026-05-28` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6.3.1 + React 19, shadcn/ui + Tailwind 4, file-based routing; auth pages + dashboard działają; brak stron/komponentów fiszek (`src/pages/`)
- **Backend / API:** partial — auth API routes obecne (`src/pages/api/auth/`); brak integracji AI/LLM; brak warstwy serwisowej
- **Data:** partial — klient Supabase (`src/lib/supabase.ts`); brak migracji, brak schematu, brak typów dla fiszek (`supabase/migrations/` puste)
- **Auth:** present — pełny stack Supabase SSR: middleware + protected routes + strony auth (`src/middleware.ts`, `src/pages/auth/`)
- **Deploy / infra:** partial — wrangler.jsonc + GitHub Actions (ci.yml + deploy.yml) + adapter Cloudflare skonfigurowany; brak `.dev.vars.example`, `OPENROUTER_API_KEY` nieobecny w `.env.example`
- **Observability:** absent — brak logowania, error trackingu ani instrumentacji middleware

## Foundations

### F-01: Schemat bazy danych — tabela flashcards

- **Outcome:** (foundation) migracja Supabase tworzy tabelę `flashcards` (id, user_id, front, back, created_at, updated_at) z RLS — każdy użytkownik widzi tylko swoje karty.
- **Change ID:** db-schema
- **PRD refs:** NFR (każde konto izolowane — "no cross-account data leakage under any request path"), FR-006, FR-007, FR-008
- **Unlocks:** S-01 (karty muszą gdzieś się zapisać), S-02 (CRUD na kolekcji), S-03 (karty do powtórek)
- **Prerequisites:** —
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** Pola SRS (interval, ease_factor, due_date) zależą od wyboru biblioteki (FR-010). Rdzeń tabeli `flashcards` jest od tego niezależny i może powstać teraz; pola SRS zostaną dodane osobną migracją w ramach S-03. Block: no.
- **Risk:** Musi być pierwsza — każda inna praca na danych na tym zależy. RLS wymagane przez NFR od dnia 1; pominięcie go teraz = poprawka pod presją, nie planowo.
- **Status:** done

---

### F-02: Klient OpenRouter + zmienne środowiskowe AI

- **Outcome:** (foundation) `src/lib/ai.ts` eksportuje gotowy klient OpenRouter; `OPENROUTER_API_KEY` dodany do `.dev.vars.example`, `.env.example` i walidacji schematu env.
- **Change ID:** openrouter-client
- **PRD refs:** FR-003, NFR (feedback widoczny w 2s od submitu — wymaga działającej integracji AI)
- **Unlocks:** S-01 (generowanie fiszek przez AI)
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Integracja AI jest największym ryzykiem jakościowym MVP (PRD: "the highest-risk assumption"). Wczesna weryfikacja w F-02 pozwala wykryć problemy z kompatybilnością workerd/CJS przed wejściem w S-01. Per `lessons.md`: sprawdzić limit CPU workerd (50ms free / 30s paid) na AI routes przed deployem.
- **Status:** done

## Slices

### S-01: Generowanie i przegląd fiszek z tekstu

- **Outcome:** zalogowany użytkownik może wkleić tekst źródłowy, zobaczyć sugestie fiszek wygenerowane przez AI (front + back), zaakceptować, edytować lub odrzucić każdą z nich z osobna, a zaakceptowane karty zapisują się do kolekcji i przeżywają przeładowanie strony.
- **Change ID:** ai-generation-flow
- **PRD refs:** US-01, FR-001, FR-002, FR-003, FR-004
- **Prerequisites:** F-01, F-02
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:**
  - Czy wywołania AI mieszczą się w limicie CPU workerd (50ms free / 30s paid)? — Owner: user. Block: no (przygotować upgrade na plan paid przed deployem AI routes).
- **Risk:** Rdzeń produktu i centralny test hipotezy AI — powinien być dostarczony jak najwcześniej. Opóźnienie o S-02 zostawia centralną hipotezę nieprzetestowaną do końca sprintu.
- **Status:** done

---

### S-02: Kolekcja fiszek — przeglądanie, edycja, usuwanie, tworzenie ręczne

- **Outcome:** zalogowany użytkownik może zobaczyć swoje fiszki jako płaską listę, stworzyć kartę ręcznie (front + back), edytować dowolną zapisaną kartę oraz usunąć kartę po potwierdzeniu.
- **Change ID:** flashcard-collection
- **PRD refs:** FR-005, FR-006, FR-007, FR-008
- **Prerequisites:** F-01
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Niskie ryzyko techniczne (standard CRUD + Supabase). Guardrail PRD: zmiany kart muszą przeżyć przeładowanie — weryfikować każdą operację zapisu przez reload strony.
- **Status:** done

---

### S-03: Sesja powtórek (SRS)

- **Outcome:** zalogowany użytkownik może uruchomić sesję spaced repetition na swoich zapisanych fiszkach; aplikacja pokazuje karty w kolejności wyznaczonej przez algorytm SRS i zapamiętuje wyniki do następnej sesji.
- **Change ID:** srs-review-session
- **PRD refs:** FR-009, FR-010
- **Prerequisites:** F-01, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Wybór biblioteki SRS (FR-010 eksplicytnie odracza decyzję) — Owner: user. Block: no (odroczone do `/10x-plan srs-review-session` — slice świadomie odblokowany 2026-06-05 przed podjęciem decyzji). Schemat pól SRS (interval, ease_factor, due_date) zależy od wybranej biblioteki; migracja SRS powstanie po rozstrzygnięciu w fazie planowania.
- **Risk:** Jedyna zewnętrzna zależność nierozstrzygnięta w PRD. Decyzja o bibliotece przeniesiona do fazy planowania; jej zwłoka opóźni projekt schematu pól SRS. Kandydaci: `ts-fsrs` (SM-2/SM-5, TypeScript-native) lub prosty harmonogram 1d→3d→7d (zero zewnętrznych zależności, prostszy schemat).
- **Status:** done

---

### S-04: Usuwanie konta (RODO)

- **Outcome:** zalogowany użytkownik może trwale usunąć swoje konto wraz ze wszystkimi danymi (fiszki + historia powtórek) po wyraźnym potwierdzeniu; po usunięciu zostaje wylogowany i nie może się ponownie zalogować tym kontem. Realizuje RODO art. 17 („prawo do bycia zapomnianym") i domyka cykl życia konta zapoczątkowany przez FR-001.
- **Change ID:** account-deletion
- **PRD refs:** FR-011 (proponowany — RODO art. 17; PRD do aktualizacji), NFR (izolacja kont — po usunięciu dane nie istnieją pod żadną ścieżką żądania)
- **Prerequisites:** F-01 (tabela `flashcards` z FK `ON DELETE CASCADE` na `auth.users` — kaskada już istnieje), istniejący auth (signin/signout/middleware)
- **Parallel with:** — (MVP slices done; brak aktywnych równoległych)
- **Blockers:** —
- **Unknowns:**
  - **Mechanizm usunięcia rekordu z `auth.users`** — klient SSR używa anon `SUPABASE_KEY` i NIE ma uprawnień do `auth.admin.deleteUser`. Dwie opcje: **(a)** osobny klient admin z nowym sekretem `SUPABASE_SERVICE_ROLE_KEY` (tylko server-side, nigdy do przeglądarki) wywołujący `supabase.auth.admin.deleteUser(userId)` — oficjalnie wspierana ścieżka; **(b)** Postgres RPC `SECURITY DEFINER` kasująca self z `auth.users`, wywoływana przez zalogowanego usera (bez nowego sekretu, ale custom SQL na schemacie auth). Owner: user. Block: tak — determinuje, czy do produkcji trafia nowy sekret. Rozstrzygane w `/10x-plan account-deletion`. Rekomendacja: opcja (a).
  - **Twarde czy miękkie usunięcie?** RODO art. 17 sugeruje trwałe usunięcie bez zbędnej zwłoki. Rekomendacja: hard delete + cascade (bez okresu karencji w MVP). Owner: user. Block: no.
- **Risk:** Operacja nieodwracalna i regulowana prawnie. Wymaga: (1) wyraźnego potwierdzenia jak w FR-008 (np. wpisanie e-maila lub słowa „USUŃ"), (2) pewności że cascade kasuje WSZYSTKIE tabele zależne — obecnie tylko `flashcards`; przy dodaniu nowych tabel pilnować `ON DELETE CASCADE`, (3) `SUPABASE_SERVICE_ROLE_KEY` to sekret o pełnych uprawnieniach — per Deployment rules: tylko env var, nigdy w trackowanym pliku, dodawany ręcznie do produkcji. Verify: po usunięciu konta ponowne logowanie = odmowa; dane nieosiągalne pod żadną ścieżką (NFR).
- **Status:** done

---

### S-05: Poprawki UX/UI

- **Outcome:** zalogowany użytkownik widzi czytelniejszy, bardziej zachęcający dashboard — każda opcja (Generuj fiszki, Moja kolekcja, Sesja powtórek) ma krótki opis (kilka słów) wyjaśniający co robi, a układ prowadzi wzrok do głównej akcji zamiast płaskiej listy linków. Slice obejmuje też zamkniętą listę drobnych poprawek UX uzgodnioną w fazie planowania.
- **Change ID:** ux-polish
- **PRD refs:** — (brak bezpośredniego FR; usability/UX. Pośrednio wspiera adopcję — użytkownik szybciej trafia do pełnego flow north star)
- **Prerequisites:** S-01, S-02, S-03 (dashboard opisuje opcje, które muszą już istnieć — wszystkie `done`)
- **Parallel with:** S-04 (różne pliki: `dashboard.astro` + ekrany vs flow usuwania konta — bezpieczne równolegle, idealny kandydat na osobny worktree per M2L5)
- **Blockers:** —
- **Stan obecny:** `src/pages/dashboard.astro` — wyśrodkowana karta z 3 linkami-przyciskami (`/generate`, `/flashcards`, `/review`) + sign out; brak jakiegokolwiek opisu opcji.
- **Unknowns:**
  - **Zakres poza dashboardem** — które dodatkowe drobne poprawki UX wchodzą (np. spójność nagłówków między ekranami, empty-states, responsywność, focus/hover)? Owner: user. Block: no — zakres MUSI zostać zamknięty w `/10x-plan` (lista konkretnych poprawek), żeby uniknąć rozlewania zakresu.
  - **Ikony per opcja** — czy dodać ikony (lucide-react już dostępne przez shadcn) czy zostać przy samym tekście? Owner: user. Block: no.
- **Risk:** Slice „polish" jest najbardziej podatny na **scope creep** — bez zamkniętej listy poprawek rośnie w nieskończoność. Guardrail: rdzeniem i kryterium akceptacji jest dashboard z opisami opcji; reszta tylko z zamkniętej listy w planie. Niskie ryzyko techniczne — statyczny `.astro` + Tailwind (ewentualnie shadcn `card`), bez zmian w danych/API/migracjach. Verify: dashboard pokazuje opis przy każdej opcji; istniejące przepływy (generowanie/kolekcja/powtórki) działają jak wcześniej.
- **Status:** done

## Backlog Handoff

| Roadmap ID | Change ID            | Suggested issue title                                       | Ready for `/10x-plan` | Notes                                                           |
|------------|----------------------|-------------------------------------------------------------|-----------------------|-----------------------------------------------------------------|
| F-01       | db-schema            | Migracja: schemat flashcards + RLS w Supabase               | yes                   | Uruchom `/10x-plan db-schema`                                   |
| F-02       | openrouter-client    | Konfiguracja klienta OpenRouter + zmienne env AI            | yes                   | Uruchom `/10x-plan openrouter-client`                           |
| S-01       | ai-generation-flow   | Generowanie fiszek z tekstu przez AI + przegląd i zapis     | no                    | Wymaga F-01 + F-02                                              |
| S-02       | flashcard-collection | Kolekcja fiszek: widok, tworzenie ręczne, edycja, usunięcie | no                    | Wymaga F-01                                                     |
| S-03       | srs-review-session   | Sesja powtórek SRS                                          | yes                   | Odblokowany; wybór biblioteki SRS (Question #2) rozstrzygany w `/10x-plan` |
| S-04       | account-deletion     | Usuwanie konta (RODO art. 17) z kaskadą danych             | yes                   | Mechanizm usunięcia z `auth.users` (Question #3) rozstrzygany w `/10x-plan`; PRD wymaga dopisania FR-011 |
| S-05       | ux-polish            | Poprawki UX/UI: czytelniejszy dashboard z opisami opcji    | yes                   | Zamknąć listę poprawek w `/10x-plan` (guardrail na scope creep); rdzeń = dashboard z opisami |

## Open Roadmap Questions

1. **Polityka retencji tekstu źródłowego** — Czy użytkownicy wklejający poufny materiał (notatki medyczne, briefingi prawne) wymagają gwarancji, że tekst nie jest przechowywany po zakończeniu generowania? PRD: nie blokuje MVP, ale decyzja powinna zapaść przed skalowaniem do profesjonalnych użytkowników. Owner: user. Block: nie blokuje żadnego slica MVP.

2. **Wybór biblioteki SRS** — ✅ ROZSTRZYGNIĘTE 2026-06-06: wybrano **`ts-fsrs`** (FSRS, TypeScript-native, aktywnie utrzymywana). Odrzucony kandydat: prosty harmonogram interwałowy (1d→3d→7d). Schemat pól SRS i architekturę S-03 zaimplementowano na bazie `ts-fsrs` — zob. `context/archive/2026-06-05-srs-review-session/`.

3. **Mechanizm usunięcia konta (S-04)** — Jak skasować rekord z `auth.users`, skoro klient SSR używa anon `SUPABASE_KEY`? Opcje: (a) klient admin z `SUPABASE_SERVICE_ROLE_KEY` + `auth.admin.deleteUser()` (nowy sekret w produkcji, ścieżka oficjalna); (b) Postgres RPC `SECURITY DEFINER` (bez nowego sekretu, custom SQL na schemacie auth). Determinuje, czy do produkcji trafia nowy sekret o pełnych uprawnieniach. Owner: user. Block: tak dla S-04 — rozstrzygane w `/10x-plan account-deletion`. Rekomendacja: opcja (a).

4. **Aktualizacja PRD o usuwanie konta** — ✅ ROZSTRZYGNIĘTE 2026-06-08: PRD zawiera już FR-011 (usuwanie konta, RODO art. 17) jako must-have — zob. `context/foundation/prd.md`. Wymaganie ma źródło; niespójność dokumentacji zamknięta. Sekret `SUPABASE_SERVICE_ROLE_KEY` (opcja (a) z Question #3) potwierdzony w produkcji 2026-06-08.

## Parked

- **Własny algorytm SRS** — Dlaczego: PRD §Non-Goals — budowanie zastrzeżonego algorytmu jest kosztowne i ortogonalne do weryfikacji hipotezy AI.
- **Import z wielu formatów (PDF, DOCX, zdjęcia)** — Dlaczego: PRD §Non-Goals — parsowanie dokumentów to odrębna powierzchnia produktowa od jakości generowania AI.
- **Udostępnianie talii / współpraca** — Dlaczego: PRD §Non-Goals — wymaga przeprojektowania kontroli dostępu i funkcji społecznościowych.
- **Aplikacje mobilne** — Dlaczego: PRD §Non-Goals — overhead platformy przed walidacją core value proposition na web.
- **Observability / error tracking** — Dlaczego: poza zakresem PRD MVP; rozważyć w v2 jeśli AI route timeout'y staną się problemem produkcyjnym.

## Done

(Puste przy pierwszym generowaniu. `/10x-archive` dopisuje wpis tutaj gdy zmiana o pasującym `Change ID` zostaje zarchiwizowana.)

- **F-01: (foundation) migracja Supabase tworzy tabelę `flashcards` (id, user_id, front, back, created_at, updated_at) z RLS — każdy użytkownik widzi tylko swoje karty.** — Archived 2026-06-03 → `context/archive/2026-05-28-db-schema/`. Lesson: —.
- **F-02: (foundation) `src/lib/ai.ts` eksportuje gotowy klient OpenRouter; `OPENROUTER_API_KEY` dodany do `.dev.vars.example`, `.env.example` i walidacji schematu env.** — Archived 2026-06-03 → `context/archive/2026-06-01-openrouter-client/`. Lesson: —.
- **S-01: zalogowany użytkownik może wkleić tekst źródłowy, zobaczyć sugestie fiszek wygenerowane przez AI (front + back), zaakceptować, edytować lub odrzucić każdą z nich z osobna, a zaakceptowane karty zapisują się do kolekcji i przeżywają przeładowanie strony.** — Archived 2026-06-03 → `context/archive/2026-06-01-ai-generation-flow/`. Lesson: —.
- **S-02: zalogowany użytkownik może zobaczyć swoje fiszki jako płaską listę, stworzyć kartę ręcznie (front + back), edytować dowolną zapisaną kartę oraz usunąć kartę po potwierdzeniu.** — Archived 2026-06-03 → `context/archive/2026-06-02-flashcard-collection/`. Lesson: —.
- **S-03: zalogowany użytkownik może uruchomić sesję spaced repetition na swoich zapisanych fiszkach; aplikacja pokazuje karty w kolejności wyznaczonej przez algorytm SRS i zapamiętuje wyniki do następnej sesji.** — Archived 2026-06-06 → `context/archive/2026-06-05-srs-review-session/`. Lesson: —.
- **S-05: zalogowany użytkownik widzi czytelniejszy, bardziej zachęcający dashboard — każda opcja (Generuj fiszki, Moja kolekcja, Sesja powtórek) ma krótki opis (kilka słów) wyjaśniający co robi, a układ prowadzi wzrok do głównej akcji zamiast płaskiej listy linków.** — Archived 2026-06-06 → `context/archive/2026-06-06-ux-polish/`. Lesson: —.
- **S-04: zalogowany użytkownik może trwale usunąć swoje konto wraz ze wszystkimi danymi (fiszki + historia powtórek) po wyraźnym potwierdzeniu; po usunięciu zostaje wylogowany i nie może się ponownie zalogować tym kontem.** — Archived 2026-06-06 → `context/archive/2026-06-06-account-deletion/`. Lesson: —.
