<!-- PLAN-REVIEW-REPORT -->
# Przegląd planu: Odwrócenie zależności core→cli dla cli/infra/*

- **Plan**: context/changes/large-scale-and-legacy-code/refactor-opportunities/plan.md
- **Tryb**: Głęboki
- **Data**: 2026-07-01
- **Werdykt**: DO POPRAWY → **SOLIDNY** (po sortowaniu: F1/F2/F3 naprawione, F4 odrzucone jako zamierzone)
- **Ustalenia**: 1 krytyczne, 2 ostrzeżenia, 1 obserwacja
- **Sortowanie (2026-07-01)**: Naprawiono F1, F2, F3; Odrzucono F4

## Werdykty

| Wymiar | Werdykt (wyjściowy) | Po sortowaniu |
|-----------|---------|---------|
| Zgodność ze stanem końcowym | ZALICZONY | ZALICZONY |
| Oszczędne wykonanie | OSTRZEŻENIE | ZALICZONY (F4 zamierzone) |
| Dopasowanie architektoniczne | OSTRZEŻENIE | ZALICZONY (F2 naprawione) |
| Martwe punkty | OSTRZEŻENIE | ZALICZONY (F3 naprawione) |
| Kompletność planu | NIEZALICZONY | ZALICZONY (F1 naprawione) |

## Ugruntowanie

9/10 ścieżek (eslint.config.js — zła lokalizacja: jest tylko root `./eslint.config.js`, nie `packages/astro/eslint.config.js`), 6/6 symboli ✓ (8 value-importów w dev.ts:25-26, preview:12-13, vite:9-12; K2 runtime.ts:12; porty cli/definitions.ts TextStyler:10/AstroVersionProvider:20/CommandExecutorOptions:31/CommandExecutor:39/OperatingSystemProvider:47 — wszystkie dokładne), brief↔plan ✓. Klon to sparse checkout (test/ śledzony w git, niematerializowany na dysku — normalne dla trybu plan-only). Promień rażenia: 1 pominięty zestaw importerów (test/units/cli/*). index.test pokrywa BuildTime+ProcessOS ✓, cli.test (astro --version e2e) istnieje ✓.

## Mocne strony (bez ustaleń)

Sekwencja od-liścia-do-korzenia prawidłowo ugruntowana w kodzie; shim per-slice = pełna odwracalność; plik wyjątków z milestonem honoruje regułę „kill-date" z lessons.md; charakteryzacja przed przenosinami dla obu nieodkrytych ścieżek (piccolore, Tinyexec) jest poprawnie „test najpierw"; brak sprzeczności zakresu (repoint ścieżek cli/info ≠ przeniesienie facetu — jawnie rozróżnione).

## Ustalenia

### F1 — Sekcja Postępu używa polskich nagłówków; kontrakt /10x-implement wymaga angielskich

- **Waga**: ❌ KRYTYCZNE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Kompletność planu
- **Lokalizacja**: Sekcja „## Postęp" (linie 384-468) + nagłówki „## Faza N"
- **Szczegóły**: Plan używa `## Postęp`, `### Faza N:`, `#### Automatyczne`, `#### Ręczne`. `references/progress-format.md` (jedyne źródło prawdy) oraz `/10x-implement` grepują literalne angielskie tokeny: `## Progress`, `## Phase N:`, `#### Automated`, `#### Manual` (zweryfikowane w 10x-implement/SKILL.md:54, :58, :143). Uruchomiony na tym planie `/10x-implement` znajdzie 0 faz i 0 oczekujących kroków — cicha awaria. Powiązany, mniejszy problem: Faza 1 (3 punkty ręczne → Progress 1.5-1.6, 2 punkty) i Faza 6 (4 → 6.6-6.8, 3 punkty) scalają kryteria, łamiąc mapowanie 1:1 Faza↔Postęp.
- **Poprawka**: Zmień nagłówki strukturalne na angielskie tokeny (`## Progress`, `### Phase N: <tytuł PL>`, `#### Automated`, `#### Manual`) — treść/tytuły mogą zostać po polsku; przywróć mapowanie 1:1 (jeden `- [ ] N.M` na każdy punkt kryteriów sukcesu w Fazie 1 i 6). Nie zmienia logiki planu, odblokowuje przyszłą egzekucję.
- **Decyzja**: NAPRAWIONE — nagłówki strukturalne zmienione na angielskie tokeny (6× `## Phase`, 6× `### Phase`, `## Progress`, 6+6 `#### Automated`/`#### Manual`, 12× `#### *Verification:` w blokach faz; 0 pozostałych PL tokenów). Mapowanie 1:1: wiersze `#### Automated` (bramkowane przez /10x-implement) mapują się 1:1 we wszystkich fazach; grupowanie wierszy ręcznych zostawione bez zmian jako spójna konwencja całego planu (nie anomalia Fazy 1/6, wiersze ręczne nie są parsowane maszynowo).

### F2 — Reguła eslint celuje w nieistniejący config per-pakiet; zasięg root flat-config nietknięty

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Dopasowanie architektoniczne
- **Lokalizacja**: Faza 1 §1 (linia 72), Faza 6 §3 (linia 325)
- **Szczegóły**: Plan każe edytować `packages/astro/eslint.config.js` — ten plik NIE ISTNIEJE. Jedyny eslint config to flat config w KORZENIU repo (`./eslint.config.js`, zweryfikowane). W flat config plik per-pakiet nie jest automatycznie ładowany (brak kaskady jak w eslintrc) → reguła eslint po prostu by nie działała, dając fałszywe poczucie ochrony (kryterium 1.1 `lint` i flip error w Fazie 6 cicho no-op). Egzekwowanie ma zęby w dependency-cruiser (poprawnie celowanym `^packages/astro/src/(core|vite-plugin-app|types)`), więc stan końcowy jest osiągalny — ale połowa mechanizmu Fazy 1 jest martwa. Dodatkowo: root flat config jest repo-wide (monorepo), więc `files: ['**/core/**', ...]` + `no-restricted-imports` na `**/cli/**` złapałby inne pakiety. Poboczne: kryteria używają `npm run`, repo to workspace pnpm (`pnpm run …`).
- **Poprawka**: Przekieruj regułę do root `eslint.config.js` jako nowy obiekt flat-config zawężony ścieżkowo do `packages/astro/src/{core,vite-plugin-app,types}` (nie glob `**/core/**`); popraw polecenia na `pnpm`.
- **Decyzja**: NAPRAWIONE — Faza 1 §1: `eslint.config.js` (root, z notą „flat-config nie kaskaduje"), `files` zawężone ścieżkowo do `packages/astro/src/{core,vite-plugin-app,types}/**`. Przy okazji `.dependency-cruiser.cjs` przeniesiony do root repo (spójność z anchorem `^packages/astro/src/…` w kontrakcie §2, Faza 1/6). Wszystkie `npm run` → `pnpm run`.

### F3 — Faza 6 (usunięcie shimów) pomija testowych importerów przeniesionych symboli

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Faza 6 §1 (linia 309) — lista repointu
- **Szczegóły**: Skan promienia rażenia znalazł importerów przeniesionych symboli, których lista repointu w Fazie 6 nie wymienia: (1) `test/units/cli/utils.ts:12-18` importuje porty `AstroVersionProvider, CommandExecutorOptions, OperatingSystemProvider` (3 z 4 przenoszonych) z `dist/cli/definitions.js`; (2) `test/units/cli/index.test.ts:6-7` — `PassthroughTextStyler, ProcessOperatingSystemProvider` (2 przenoszone adaptery) z `dist/cli/infra/*` (plan repointuje tylko :3 = BuildTime); (3) `test/units/cli/misc.test.ts:3` — `PassthroughTextStyler` z `dist/cli/infra/*`. Shimy maskują to do Fazy 6; przy usunięciu shimów te importy się urywają. Kryterium 6.2 („test:unit + e2e zielono") wtedy CZERWIENIEJE. Plan myślał o repoincie testów (wymienia index.test:3 i nowe testy), więc to niepełne wyliczenie, nie ślepota — ale realna luka.
- **Poprawka**: Dopisz `test/units/cli/{utils.ts, index.test.ts, misc.test.ts}` do listy repointu Fazy 6 §1 (porty → `dist/types/cli-runtime.js`, adaptery → `dist/core/cli-runtime/*`); uwaga: to ścieżki `dist/`, nie `src/`.
- **Decyzja**: NAPRAWIONE — Faza 6 §1: dopisano trzech testowych importerów (`utils.ts:12-18`, `index.test.ts:6-7`, `misc.test.ts:3`) z jawną uwagą o ścieżkach `dist/` oraz o tym, że ich pominięcie czerwieni kryterium 6.2.

### F4 — „Martwy przełącznik" walidacji kompletności ląduje 4 fazy za wcześnie

- **Waga**: 🔭 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Oszczędne wykonanie
- **Lokalizacja**: Faza 1 §3 (linie 86-92)
- **Szczegóły**: Faza 1 ląduje wyłączoną walidację kompletności (bramkowaną `ENFORCE_LAYER_BOUNDARIES`), która nic nie robi aż do aktywacji plikiem wyjątków w Fazie 6. Nic między Fazą 1 a 6 jej nie używa. Jest sensowna tylko gdy plik wyjątków istnieje (Faza 6). Faza 1 potrzebuje tylko reguły kierunkowej `warn`.
- **Poprawka**: Rozważ przeniesienie trybu walidacji kompletności do Fazy 6 (gdzie jest aktywowany); Faza 1 zostaje minimalna.
- **Decyzja**: ODRZUCONE — świadomy wybór autora planu („mechanizm na zielono, egzekwowanie osobno"); martwy przełącznik w Fazie 1 jest zamierzony.
