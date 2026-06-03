---
project: "10xCards"
version: 1
status: draft
created: 2026-05-28
updated: 2026-06-03
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

> **Uwaga:** S-03 jest aktualnie zablokowany przez nierozstrzygniętą decyzję o bibliotece SRS (Open Roadmap Question #2). Pierwsza część gwiazdy (S-01) odblokuje się po F-01 + F-02.

## At a glance

| ID   | Change ID            | Outcome (user can …)                                                            | Prerequisites | PRD refs                              | Status   |
|------|----------------------|---------------------------------------------------------------------------------|---------------|---------------------------------------|----------|
| F-01 | db-schema            | (foundation) schemat flashcards + RLS w Supabase                                | —             | NFR, FR-006, FR-007, FR-008           | done     |
| F-02 | openrouter-client    | (foundation) klient OpenRouter skonfigurowany + zmienne env AI                  | —             | FR-003, NFR                           | done     |
| S-01 | ai-generation-flow   | wkleić tekst, zobaczyć sugestie AI, zaakceptować/edytować/odrzucić, zapisać     | F-01, F-02    | US-01, FR-001, FR-002, FR-003, FR-004 | done     |
| S-02 | flashcard-collection | zobaczyć kolekcję, dodać kartę ręcznie, edytować i usunąć z potwierdzeniem      | F-01          | FR-005, FR-006, FR-007, FR-008        | done     |
| S-03 | srs-review-session   | uruchomić sesję powtórek z kartami wg algorytmu SRS                             | F-01, S-01    | FR-009, FR-010                        | blocked  |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme               | Chain                              | Note                                                                                      |
|--------|---------------------|------------------------------------|-------------------------------------------------------------------------------------------|
| A      | Gwiazda przewodnia  | `F-01` / `F-02` → `S-01` → `S-03` | Krytyczna ścieżka do pełnego flow; F-01 i F-02 równolegle, S-03 zablokowany do wyboru SRS. |
| B      | Zarządzanie kartami | `S-02`                             | Rozgałęzia się od F-01 (Stream A); startuje po F-01, niezależnie od F-02 i S-01.         |

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
  - Wybór biblioteki SRS (FR-010 eksplicytnie odracza decyzję) — Owner: user. Block: yes. Schemat pól SRS (interval, ease_factor, due_date) zależy od wybranej biblioteki; nie można zaprojektować migracji SRS bez tej decyzji.
- **Risk:** Jedyna zewnętrzna zależność nierozstrzygnięta w PRD. Późny wybór blokuje zarówno S-03, jak i pola SRS w kolejnej migracji po F-01. Kandydaci: `ts-fsrs` (SM-2/SM-5, TypeScript-native) lub prosty harmonogram 1d→3d→7d (zero zewnętrznych zależności, prostszy schemat).
- **Status:** blocked

## Backlog Handoff

| Roadmap ID | Change ID            | Suggested issue title                                       | Ready for `/10x-plan` | Notes                                                           |
|------------|----------------------|-------------------------------------------------------------|-----------------------|-----------------------------------------------------------------|
| F-01       | db-schema            | Migracja: schemat flashcards + RLS w Supabase               | yes                   | Uruchom `/10x-plan db-schema`                                   |
| F-02       | openrouter-client    | Konfiguracja klienta OpenRouter + zmienne env AI            | yes                   | Uruchom `/10x-plan openrouter-client`                           |
| S-01       | ai-generation-flow   | Generowanie fiszek z tekstu przez AI + przegląd i zapis     | no                    | Wymaga F-01 + F-02                                              |
| S-02       | flashcard-collection | Kolekcja fiszek: widok, tworzenie ręczne, edycja, usunięcie | no                    | Wymaga F-01                                                     |
| S-03       | srs-review-session   | Sesja powtórek SRS                                          | no                    | Zablokowany — wybierz bibliotekę SRS (Open Roadmap Question #2) |

## Open Roadmap Questions

1. **Polityka retencji tekstu źródłowego** — Czy użytkownicy wklejający poufny materiał (notatki medyczne, briefingi prawne) wymagają gwarancji, że tekst nie jest przechowywany po zakończeniu generowania? PRD: nie blokuje MVP, ale decyzja powinna zapaść przed skalowaniem do profesjonalnych użytkowników. Owner: user. Block: nie blokuje żadnego slica MVP.

2. **Wybór biblioteki SRS** — Która biblioteka implementuje algorytm spaced repetition? Kandydaci: `ts-fsrs` (SM-2/SM-5, TypeScript-native, aktywnie utrzymywana) lub prosty harmonogram interwałowy (1d→3d→7d, zero zewnętrznych zależności). Decyzja determinuje schemat pól SRS w kolejnej migracji po F-01 i architekturę S-03. Owner: user. Block: S-03.

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
