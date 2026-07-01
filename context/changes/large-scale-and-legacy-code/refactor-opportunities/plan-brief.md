# Odwrócenie zależności `core→cli` dla `cli/infra/*` — Krótki plan

> Pełny plan: `context/changes/large-scale-and-legacy-code/refactor-opportunities/plan.md`
> Badania: `context/changes/large-scale-and-legacy-code/refactor-opportunities/research.md`

## Co i dlaczego

`core/dev`, `core/preview`, `core/messages` i `vite-plugin-app` importują adaptery i porty z `cli/` — odwrócona zależność runtime `core→cli`. „Refaktor CLI" łamie serwer dev/preview i plugin Vite, cicho. Przenosimy porty (kontrakt) do `types/` i adaptery (implementacja) do `core/cli-runtime/`, odcinając przeciek — poprzedzone strażnikiem granic, żeby smell nie odrósł. **Tryb: plan-only** — weryfikacje opisane, nie uruchamiane w tej zmianie.

## Punkt wyjścia

8 value-importów `cli/infra/*` w 3 plikach spoza `cli/` + 1 przeciek typów (`runtime.ts:12`, K2). Każdy adapter importuje swój port z `cli/definitions.ts` (7/7), więc naturalna jednostka to port+klasa razem. CI nie ma dziś reguły kierunku warstw — pilnuje ścieżki, nigdy kierunku.

## Pożądany stan końcowy

Porty w `types/cli-runtime.ts`, adaptery w `core/cli-runtime/`. `core/dev|preview|messages` mają zero krawędzi do `cli/` i strażnik egzekwuje to jako **error**. `vite-plugin-app` czysty z `cli/infra`; pozostałe 5 krawędzi do `cli/info` jest jawnie uzasadnionych w pliku wyjątków (odroczony facet). `piccolore` i `Tinyexec` mają testy charakteryzujące.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Wykonanie | Tylko plan (bez kodu) | Klon read-only w dyscyplinie analizy | Plan |
| Sekwencja | Strażnik #1 + slice'y per adapter, od najtańszej do korzenia | Każda faza domyka jeden port end-to-end, odwracalna; strażnik chroni każdy slice | Plan |
| Facet `cli/info/*` | Odroczony do osobnej transzy | To de facto drugi K2+K1 z własnym klastrem portów | Plan |
| Lokalizacja | Porty→`types/`, adaptery→`core/cli-runtime/` | `CONTRIBUTING.md`: `types/` to dom typów framework-neutralnych | Plan |
| Narzędzie granic | eslint no-restricted-imports + dependency-cruiser | Szybki feedback lokalny + graf w CI | Plan |
| Seam N1 (Tinyexec) | Charakteryzacja przed przenosinami | Jedyny nieotestowany adapter z twardym importem | Plan |

## Zakres

**W zakresie:** strażnik granic (warn→error per-warstwa); relokacja 4 portów + 5 adapterów `cli/infra`; domknięcie K2; testy charakteryzujące `piccolore` i `Tinyexec`; plik wyjątków dla pozostałych krawędzi.

**Poza zakresem:** facet `cli/info/*` (osobna transza); N2/N3/N5/N6; testowanie/eksport `resolveCommand` (N4); zmiany zachowania runtime; nowe granice pakietu / kontener DI; porty `HelpDisplay`/`CommandRunner` (nie przeciekają).

## Architektura / Podejście

Cięcie pionowe „od liści do korzenia": strażnik ląduje pasywnie (mechanizm na zielono), potem 4 slice'y **od najtańszego i najbardziej samodzielnego** (`ProcessOS`, vite-only) **do korzenia** (`BuildTime`, importowany przez wszystkie 3 pliki). Każdy slice = port do `types/` + klasa do `core/cli-runtime/` + repoint konsumentów + shim re-eksportu (odwracalne). Slice dotykający nieodkrytej ścieżki otwiera się testem charakteryzującym (test najpierw, nie obok). Na końcu plik wyjątków aktywuje walidację kompletności i flip strażnika per-warstwa (egzekwowanie osobno od mechanizmu).

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Strażnik (warn) | Wykrywanie `core→cli`, pasywne | Reguła łapie zły zestaw krawędzi → kontrola grepem |
| 2. Slice ProcessOS | Najtańszy, samodzielny; dowodzi mechanizmu relokacji | Konsument w odroczonym facecie (shim) |
| 3. Slice CommandExecutor | Tinyexec odcięty + seam/test | Twardy import `tinyexec`, nieotestowany → seam najpierw |
| 4. Slice TextStyler | piccolore charakteryzowany; ramię K2 | piccolore bez pokrycia → test najpierw |
| 5. Slice BuildTime (korzeń) | K2 domknięty; dev/preview/messages czyste | Najszerszy repoint (3 konsumenci + K2 + format-version) |
| 6. Wyjątki + flip per-warstwa | Egzekwowanie error; shimy usunięte | Flip globalny niemożliwy (facet) → per-warstwa |

**Wymagania wstępne:** zapisywalna gałąź klonu (jeśli kiedykolwiek wykonywane); brak — dla trybu plan-only.
**Szacowany nakład pracy:** ~6 kroków/commitów (1 strażnik + 4 slice'y + 1 sprzątanie), każdy niewielki i odwracalny.

## Otwarte ryzyka i założenia

- Flip strażnika jest **częściowy** — `vite→cli/info` (5 krawędzi) zostaje jako uzasadniony warn do transzy facetu; pełne error dopiero po tamtej transzy.
- `logger-help-display.ts:2` konsumuje przeniesione porty wewn. `cli/` → shim do Fazy 6.
- Tryb plan-only: „Weryfikacja automatyczna" to specyfikacja done, nie wynik odpalenia.

## Kryteria sukcesu (podsumowanie)

- Zero value-importów `cli/infra` i zero importów `cli/definitions` spoza `cli/` (`grep`).
- Strażnik odrzuca próbny import `cli/*` w `core/dev` (dowód egzekwowania per-warstwa).
- `astro --version`/`dev`/`preview`/`info` renderują identycznie; testy charakteryzujące zielone przed i po przenosinach.
