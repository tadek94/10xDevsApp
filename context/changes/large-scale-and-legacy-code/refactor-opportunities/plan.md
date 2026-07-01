# Odwrócenie zależności `core→cli` dla `cli/infra/*` — Plan implementacji

> **Tryb: plan-only.** Ten plan jest artefaktem planistycznym dla klonu `astro-legacy-analysis/` (read-only w dyscyplinie analizy). Komendy w „Weryfikacji automatycznej" opisują, jak *dowieść* każdej fazy, ale **nie są uruchamiane w ramach tej zmiany**. Wykonanie (na osobnej, zapisywalnej gałęzi) to odrębna decyzja.

## Przegląd

Naprawiamy strukturalny smell udokumentowany i zweryfikowany w `research.md`: warstwa „rdzenia" (`core/dev`, `core/preview`, `core/messages`) i `vite-plugin-app` importują konkretne adaptery oraz porty z `cli/` — odwrócona zależność `core→cli`. Plan przenosi porty (kontrakt) do `types/` i adaptery (implementacja) do `core/cli-runtime/`, **pionowymi slice'ami per port**, poprzedzonymi strażnikiem granic warstw. Facet `cli/info/*` jest świadomie **odroczony** do osobnej transzy.

Trzon metodyczny: **test, zanim dotkniesz** (charakteryzacja nieodkrytej ścieżki przed jej edycją), **mechanizm na zielono / egzekwowanie osobno** (strażnik ląduje pasywnie, flip na error to późniejsza faza), **od liści do korzenia** (najtańszy i najbardziej samodzielny slice pierwszy, adapter o najszerszym promieniu — „korzeń" — ostatni; każdy slice = osobny odwracalny commit).

## Analiza stanu obecnego

- **8 value-importów `cli/infra/*` w 3 plikach spoza `cli/`** (zweryfikowane co do wiersza): `core/dev/dev.ts:25-26`, `core/preview/static-preview-server.ts:12-13`, `vite-plugin-app/createAstroServerApp.ts:9-12`. Cztery konsumenty robią `new X()` bezpośrednio — brak fabryki/rejestru do rozplątania.
- **1 przeciek kontraktu typów (K2)**: `core/messages/runtime.ts:12` importuje `import type { AstroVersionProvider, TextStyler }` z `cli/definitions.ts` — jedyny importer `cli/definitions` spoza `cli/`.
- **Twardy porządek K2 ≤ K1**: każdy adapter `cli/infra/*` importuje swój port z `cli/definitions.ts` (7/7). Przeniesienie klasy bez przeniesienia jej portu odtwarza słabszą krawędź type-only.
- **Brak strażnika granic w CI**: `eslint.config.js` nie ma `no-restricted-imports`/zones, brak dependency-cruiser. CI pilnuje *poprawności ścieżki* (tsc, unit, e2e), nigdy *kierunku warstwy* → smell odrasta na zielonym CI.
- **Nieodkryte ścieżki w zakresie**: `piccoloreTextStyler` (testy używają tylko `PassthroughTextStyler`) i `TinyexecCommandExecutor` (N1 — twardy import `tinyexec`, testy podstawiają `SpyCommandExecutor`). `BuildTimeAstroVersionProvider` i `ProcessOperatingSystemProvider` są pokryte (`index.test`, `cli.test` e2e).
- **Facet `cli/info/*` (odroczony)**: 5 importów w `vite-plugin-app:4-8`, własny klaster portów `cli/info/definitions.ts` + dwukierunkowe sprzężenie do `cli/definitions.ts` (`cli-debug-info-provider.ts:2` → `AstroVersionProvider, OperatingSystemProvider`; `get-package-manager.ts:1` → `CommandExecutor`).
- **`CONTRIBUTING.md:394-402`**: `types/` jest udokumentowanym domem typów („centralized to cut down on circular dependencies") — naturalna lokalizacja framework-neutralnych portów. Opis warstw jest deskryptywny; nic nie sankcjonuje `core→cli`.

## Pożądany stan końcowy

Po tym planie:
- Porty konsumowane przez `core`/`vite` (`AstroVersionProvider`, `TextStyler`, `OperatingSystemProvider`, `CommandExecutor`+`CommandExecutorOptions`) żyją w `types/cli-runtime.ts`.
- Adaptery przeciekające (`BuildTimeAstroVersionProvider`, `piccoloreTextStyler`, `PassthroughTextStyler`, `ProcessOperatingSystemProvider`, `TinyexecCommandExecutor`) żyją w `core/cli-runtime/`.
- `core/dev`, `core/preview`, `core/messages` mają **zero** krawędzi `core→cli`; strażnik granic egzekwuje je jako **error**.
- `vite-plugin-app` jest czysty z `cli/infra`; jego pozostałe krawędzie do `cli/info/*` są **jawnie uzasadnione** w pliku wyjątków (milestone: transza `cli/info`), strażnik trzyma je jako kontrolowany *warn*.
- `piccoloreTextStyler` i `TinyexecCommandExecutor` mają testy charakteryzujące istniejące zachowanie.

Weryfikacja stanu końcowego (opis — nie uruchamiane w tej zmianie): `npx tsc -b` czysto; `pnpm run test:unit` zielono (w tym nowe testy charakteryzujące); dependency-cruiser i eslint raportują 0 nieuzasadnionych krawędzi `core→cli` dla `cli/infra`; `grep` value-importów `cli/infra` spoza `cli/` = 0.

### Kluczowe odkrycia:

- Naturalna jednostka zmiany to **port + jego klasa(-y) + konsumenci**, bo klasa importuje swój port (`build-time-astro-version-provider.ts:1`, `piccolore-text-styler.ts:2`, itd.). Cięcie pionowe spełnia „K2 ≤ K1" automatycznie w obrębie slice'a.
- `TextStyler` ma **dwa** implementery (`piccolore`, `passthrough`) → slice `TextStyler` przenosi obie klasy naraz.
- **Kolejność slice'ów = rosnący promień rażenia (od liścia do korzenia)**: `ProcessOS`/`CommandExecutor` są vite-only (1 konsument, najbardziej samodzielne), `TextStyler`/`BuildTime` dotykają 3 konsumentów + K2 (`runtime.ts:12`) + `format-version` + `logger-help-display`. `BuildTime` jest importowany przez wszystkie 3 pliki („korzeń") → ostatni. Slice'y `TextStyler` (Faza 4) i `AstroVersionProvider`/`BuildTime` (Faza 5) domykają **oba** ramiona K2; `core/messages`, `core/dev`, `core/preview` są czyste dopiero **po Fazie 5**.
- `logger-help-display.ts:2` importuje `AstroVersionProvider, HelpDisplay, TextStyler` (konsument wewn. `cli/`) — po przeniesieniu portów wymaga shimu lub repointu (Faza 6).

## Czego NIE robimy (What We're NOT Doing)

- **Facet `cli/info/*`** — relokacja `cli/info/definitions.ts` i adapterów `cli/info/*` (`get-package-manager`, `dev-debug-info-provider`, node/UA providers, `styled-debug-info-formatter`) jest **osobną, późniejszą transzą**. Ten plan tylko *repointuje ścieżki importu portów* w `cli/info` (Faza 6), nie przenosi facetu.
- **N2, N3, N5, N6** (luki testowe / seamy w `cli/info/infra/*`) — poza zakresem; siedzą w odroczonym facecie.
- **N4** (`resolveCommand`/`runCommand` bez testu jednostkowego) — nie eksportujemy ani nie testujemy tu tych funkcji; `cli/index.ts` jest tylko *repointowany* (dynamiczne `import()`), nie przenoszony.
- **Zmiana zachowania runtime** — żaden adapter nie zmienia logiki; to relokacja + repoint. Wyjątek: dodanie *seamu* w `TinyexecCommandExecutor` (Faza 3a) nie zmienia obserwowalnego zachowania (charakteryzowane testem najpierw).
- **Nowe granice pakietu / kontener DI** — reuse istniejącego drzewa `packages/astro/src`; ręczny composition root w `runCommand` zostaje.
- **Nadpisywanie portów `HelpDisplay`, `CommandRunner`** — `LoggerHelpDisplay` i `CliCommandRunner` nie przeciekają (tylko `cli/index.ts`); zostają w `cli/`.

## Podejście do implementacji

Strażnik granic ląduje pierwszy w trybie pasywnym (Faza 1), potem cztery pionowe slice'y **od najtańszego i najbardziej samodzielnego do korzenia** (Fazy 2–5): `ProcessOS` (vite-only, pokryty — dowodzi mechanizmu relokacji na najprostszym przypadku) → `CommandExecutor` (vite-only, ale seam+charakteryzacja) → `TextStyler` (3 konsumenci + K2, charakteryzacja piccolore) → `BuildTime` (najszerszy promień, „korzeń", domyka K2). Na końcu plik wyjątków aktywuje egzekwowanie per-warstwa i usuwamy shimy (Faza 6). Każdy slice zostawia shim re-eksportu (port w `cli/definitions.ts`, klasa w starej ścieżce `cli/infra/`) → w pełni odwracalny, plik po pliku. Slice dotykający nieodkrytej ścieżki (`Tinyexec` w Fazie 3, `piccolore` w Fazie 4) **otwiera się testem charakteryzującym**, edycja dopiero potem.

## Krytyczne szczegóły implementacji

- **Kolejność w obrębie slice'a**: utwórz cel (port w `types/`, klasa w `core/cli-runtime/`) → przenieś → repoint konsumentów → zostaw shim. Nigdy nie przenoś klasy zostawiając jej port w `cli/` (odtwarza krawędź type-only).
- **Kolejność slice'ów = od najtańszej do korzenia**: `ProcessOS`/`CommandExecutor` (vite-only) przed `TextStyler`/`BuildTime` (3 konsumenci + K2). Najtańszy slice dowodzi pętli move+shim+repoint zanim wejdą sprzężone przypadki. To operacyjne „od liści do korzenia": liść = najmniej zależnych, korzeń (`BuildTime`, importowany przez wszystkie 3 pliki) = ostatni.
- **Egzekwowanie zapala się per-warstwa, nie globalnie**: bo facet `cli/info/*` jest odroczony, `vite-plugin-app` ma pozostałe krawędzie `core→cli` do `cli/info` po tym planie. Globalny flip `warn→error` jest **niemożliwy**; flip jest per-warstwa (dev/preview/messages → error; vite → error tylko dla ścieżek `cli/infra`, `cli/info` jako uzasadniony warn).
- **Artefakt narzędzia dla autorów reguły**: przy pisaniu/testowaniu wzorców granic — `ast-grep` rozróżnia styl cudzysłowu w literałach (`from "$SRC"` nie łapie kodu `'...'`). Reguły eslint/dependency-cruiser operują na ścieżkach modułów, nie na AST literału, więc to ich nie dotyczy, ale każdą regułę należy skontrować `grep`em na realnych krawędziach przed flipem.
- **Shimy żyją do Fazy 6**: konsumenci wewn. `cli/` (`format-version.ts`, `logger-help-display.ts`, `cli/index.ts`, ścieżki portów w `cli/info`) korzystają z re-eksportu aż do repointu w Fazie 6; dopiero potem shimy znikają.

---

## Phase 1: Strażnik granic ląduje na zielono (pasywnie)

### Przegląd

Wprowadź mechanizm wykrywania krawędzi `core→cli` w trybie nieegzekwującym. Nic nie jest przenoszone; CI zostaje zielone. „Mechanizm na zielono, egzekwowanie osobno."

### Wymagane zmiany:

#### 1. Reguła eslint (feedback lokalny)

**Plik**: `eslint.config.js` (root repo — jedyny flat-config; brak configu per-pakiet, a flat-config nie kaskaduje)

**Cel**: dodać `no-restricted-imports`/zones zakazującą importów z `cli/**` w plikach `core/**`, `vite-plugin-app/**` i `types/**`, w trybie `warn`. Szybki sygnał w edytorze i `lint`.

**Kontrakt**: nowy obiekt flat-config w root `eslint.config.js` (plik per-pakiet nie byłby ładowany — flat-config nie kaskaduje), zawężony ścieżkowo do `files: ['packages/astro/src/core/**', 'packages/astro/src/vite-plugin-app/**', 'packages/astro/src/types/**']` (nie glob `**/core/**`, który złapałby `core/` innych pakietów monorepo) i regułą `no-restricted-imports` na wzorcach ścieżek `**/cli/**`; severity `warn`. Nie podnosić do `error` w tej fazie.

#### 2. Reguła dependency-cruiser (graf w CI)

**Plik**: `.dependency-cruiser.cjs` (nowy), `packages/astro/package.json` (skrypt), `.github/workflows/ci.yml`

**Cel**: reguła kierunku warstw `no-core-to-cli` (`from: core|vite-plugin-app|types`, `to: cli`) z `severity: warn`; skrypt `depcruise` i nieblokujący krok w CI.

**Kontrakt**: `forbidden: [{ name: 'no-core-to-cli', severity: 'warn', from: { path: '^packages/astro/src/(core|vite-plugin-app|types)' }, to: { path: '^packages/astro/src/cli' } }]`. Krok CI odpala raport, ale `warn` nie łamie builda.

#### 3. Mechanizm walidacji kompletności (domyślnie OFF)

**Plik**: `.dependency-cruiser.cjs`

**Cel**: druga reguła / tryb sprawdzający, że *żadna nieuzasadniona* krawędź `core→cli` nie istnieje — **domyślnie wyłączona** (aktywowana dopiero plikiem wyjątków w Fazie 6). Ląduje jako martwy przełącznik, zielono.

**Kontrakt**: reguła bramkowana flagą/env (np. `ENFORCE_LAYER_BOUNDARIES` nieustawiona → pomijana) albo pusty na razie `allowed`/exceptions wsad; przy braku pliku wyjątków walidacja nie zgłasza nic.

### Kryteria sukcesu:

#### Automated Verification:

- Lint przechodzi (reguła w `warn`, nie łamie): `pnpm run lint:ci`
- dependency-cruiser odpala i raportuje istniejące krawędzie jako warn: `pnpm run depcruise`
- Build/typecheck bez zmian: `npx tsc -b`
- CI zielone mimo istniejących naruszeń (warn)

#### Manual Verification:

- Raport dependency-cruiser wymienia dokładnie znane krawędzie `core→cli` (8 value + K2 + 5 `cli/info`) jako warn
- Żadna reguła nie jest w `error`; nic nie zostało przeniesione
- Walidacja kompletności jest nieaktywna (brak pliku wyjątków → brak egzekwowania)

**Uwaga implementacyjna**: zatrzymaj się po Fazie 1 na ręczne potwierdzenie, że strażnik raportuje właściwy zestaw krawędzi, zanim ruszysz pierwszy slice.

---

## Phase 2: Slice `OperatingSystemProvider` + `ProcessOperatingSystemProvider` (najtańszy, samodzielny)

### Przegląd

Najtańszy i najbardziej samodzielny slice: adapter pokryty (`index.test`), jeden konsument spoza `cli/` (`vite-plugin-app:11`), bez K2, bez seamu. Dowodzi pętli move+shim+repoint na najprostszym przypadku.

### Wymagane zmiany:

#### 1. Port + adapter + repoint

**Plik**: `packages/astro/src/types/cli-runtime.ts` (nowy), `cli/definitions.ts` (shim); `core/cli-runtime/process-operating-system-provider.ts` (nowy), `cli/infra/process-operating-system-provider.ts` (shim, import portu `:1`); konsument `vite-plugin-app/createAstroServerApp.ts:11`, `cli/index.ts`

**Cel**: przenieś `OperatingSystemProvider` (`cli/definitions.ts:47`) do `types/cli-runtime.ts` i klasę do `core/cli-runtime/`; repoint vite + cli/index. Konsument portu w odroczonym facecie (`cli/info/infra/cli-debug-info-provider.ts:2`) zostaje na shimie do Fazy 6.

**Kontrakt**: relokacja + repoint specyfikatorów; bez zmian zachowania; re-eksport w `cli/definitions.ts` i na starej ścieżce `cli/infra/*`.

### Kryteria sukcesu:

#### Automated Verification:

- Typecheck czysto: `npx tsc -b`
- `test:unit` zielono
- Value-import `process-operating-system-provider` spoza `cli/` wskazuje `core/cli-runtime/`: `grep`

#### Manual Verification:

- `astro info` / debug-info w `createAstroServerApp` renderuje OS identycznie
- Shim facetu `cli/info` nadal kompiluje
- Commit samodzielny i odwracalny (rewert przywraca stan sprzed slice'a)

**Uwaga implementacyjna**: zatrzymaj się na ręczne potwierdzenie przed Fazą 3.

---

## Phase 3: Slice `CommandExecutor` + `TinyexecCommandExecutor` (seam + charakteryzacja najpierw)

### Przegląd

Vite-only (1 konsument: `vite:12`), samodzielny, ale `TinyexecCommandExecutor` (N1) jest nieotestowany i twardo importuje `x` z `tinyexec`. Faza otwiera się **seamem + testem charakteryzującym** `catch NonZeroExitError`, dopiero potem przenosiny.

### Wymagane zmiany:

#### 1. (3a) Seam + test charakteryzujący — NAJPIERW

**Plik**: `cli/infra/tinyexec-command-executor.ts` (seam), `packages/astro/test/units/cli/tinyexec-command-executor.test.ts` (nowy)

**Cel**: wprowadź punkt wstrzyknięcia dla wykonawcy `x` (domyślnie realny `x` z `tinyexec`, w teście podstawialny), aby przetestować przepakowanie błędu w `catch NonZeroExitError` (komunikat `The command … exited with code N`, przeniesienie `stderr/stdout`) bez realnego subprocessu. Test przypina to zachowanie na obecnej ścieżce.

**Kontrakt**: konstruktor/parametr przyjmujący fn wykonawcy z domyślną wartością = importowany `x`; publiczna sygnatura `execute()` bez zmian. Test zielony **przed** przenosinami. Charakteryzacja nie zmienia obserwowalnego zachowania (to warunek — patrz „Czego NIE robimy").

#### 2. (3b) Port + adapter + repoint

**Plik**: `types/cli-runtime.ts` (dla `CommandExecutor` `:39` i `CommandExecutorOptions` `:31`), `cli/definitions.ts` (shim); `core/cli-runtime/tinyexec-command-executor.ts` (nowy), `cli/infra/tinyexec-command-executor.ts` (shim, import portu `:2`); konsument `vite-plugin-app/createAstroServerApp.ts:12`, `cli/index.ts`

**Cel**: przenieś oba typy do `types/` i klasę do `core/cli-runtime/`; repoint vite + cli/index; przełącz test charakteryzujący na nowy dom. Konsument portu w facecie (`cli/info/core/get-package-manager.ts:1`) na shimie do Fazy 6.

**Kontrakt**: relokacja + repoint; seam z 3a jedzie razem z klasą.

### Kryteria sukcesu:

#### Automated Verification:

- Test charakteryzujący `Tinyexec` zielony **przed** i **po** przenosinach: `pnpm run test:unit`
- Typecheck czysto: `npx tsc -b`
- Value-import `tinyexec-command-executor` spoza `cli/` wskazuje `core/cli-runtime/`: `grep`

#### Manual Verification:

- `astro info` (ścieżka `npm ls` przez executor) działa identycznie
- Komunikat błędu przy niezerowym exit code niezmieniony (charakteryzacja to gwarantuje)
- Commit odwracalny

**Uwaga implementacyjna**: zatrzymaj się na ręczne potwierdzenie przed Fazą 4.

---

## Phase 4: Slice `TextStyler` + `piccoloreTextStyler` + `PassthroughTextStyler` (charakteryzacja najpierw)

### Przegląd

`piccoloreTextStyler` **nie ma dziś pokrycia**. Faza **zaczyna się od testu charakteryzującego** jego istniejący output, i **dopiero potem** przenosi port+obie klasy. Domyka ramię `TextStyler` w K2.

### Wymagane zmiany:

#### 1. (4a) Test charakteryzujący `piccoloreTextStyler` — NAJPIERW

**Plik**: `packages/astro/test/units/cli/piccolore-text-styler.test.ts` (nowy)

**Cel**: przypnij istniejące zachowanie stylera (sekwencje ANSI dla `dim/cyan/bgGreen/bold/green` itd.) zanim cokolwiek przeniesiesz. Test importuje z **obecnej** ścieżki `cli/infra/piccolore-text-styler.js`.

**Kontrakt**: asercje na dokładne zwroty stylera dla reprezentatywnych wejść; test zielony na kodzie sprzed zmiany. To jest brama — edycja portu/klasy dopiero po zielonym teście.

#### 2. (4b) Port `TextStyler` do `types/`

**Plik**: `packages/astro/src/types/cli-runtime.ts`, `cli/definitions.ts`

**Cel**: przenieś `TextStyler` (dziś `cli/definitions.ts:10`) do `types/cli-runtime.ts`; shim re-eksportu w `cli/definitions.ts`.

**Kontrakt**: interfejs bez zmian; `cli/definitions.ts` re-eksportuje `TextStyler`.

#### 3. (4b) Obie klasy stylera do `core/cli-runtime/`

**Plik**: `core/cli-runtime/piccolore-text-styler.ts` (nowy), `core/cli-runtime/passthrough-text-styler.ts` (nowy); stare ścieżki `cli/infra/*` (shimy); importy portu `piccolore-text-styler.ts:2`, `passthrough-text-styler.ts:1`

**Cel**: przenieś typowany const `piccoloreTextStyler` i klasę `PassthroughTextStyler`; ich import `TextStyler` na `types/cli-runtime.js`.

**Kontrakt**: bez zmiany kształtu; shimy re-eksportu na starych ścieżkach.

#### 4. (4b) Repoint konsumentów

**Plik**: `core/dev/dev.ts:26`, `core/preview/static-preview-server.ts:13`, `vite-plugin-app/createAstroServerApp.ts:10`, `core/messages/runtime.ts:12` (ramię `TextStyler`), `cli/utils/format-version.ts:1`, `cli/infra/logger-help-display.ts:2` (via shim lub repoint), `test/units/cli/piccolore-text-styler.test.ts` (przełącz na nowy dom)

**Cel**: przełącz importy; `runtime.ts:12` traci ramię `TextStyler` (zostaje ramię `AstroVersionProvider`, domykane w Fazie 5).

**Kontrakt**: wyłącznie specyfikatory importu.

### Kryteria sukcesu:

#### Automated Verification:

- Test charakteryzujący `piccolore` zielony **przed** i **po** przenosinach: `pnpm run test:unit`
- Typecheck czysto: `npx tsc -b`
- `serverStart` (`misc.test.ts`) zielono
- `runtime.ts:12` nie importuje już `TextStyler` z `cli/definitions` (zostaje `AstroVersionProvider`): `grep`

#### Manual Verification:

- Banner `serverStart` w `astro dev`/`preview` identyczny wizualnie
- Commit odwracalny

**Uwaga implementacyjna**: zatrzymaj się na ręczne potwierdzenie przed Fazą 5.

---

## Phase 5: Slice `AstroVersionProvider` + `BuildTimeAstroVersionProvider` (korzeń — domyka K2)

### Przegląd

Najszerszy promień rażenia („korzeń": importowany przez wszystkie 3 pliki + K2 + `format-version`). Adapter pokryty (`index.test:52`, `cli.test:66` e2e) → bez nowego testu charakteryzującego. Domknięcie tego slice'a zamyka **ostatnie** ramię K2 i czyni `core/dev`, `core/preview`, `core/messages` w pełni czystymi.

### Wymagane zmiany:

#### 1. Port do `types/`

**Plik**: `packages/astro/src/types/cli-runtime.ts`, `packages/astro/src/cli/definitions.ts`

**Cel**: przenieś deklarację interfejsu `AstroVersionProvider` (dziś `cli/definitions.ts:20`) do `types/cli-runtime.ts`; zostaw re-eksport w `cli/definitions.ts` (shim) dla konsumentów wewn. `cli/`.

**Kontrakt**: `export interface AstroVersionProvider { … }` przenosi się bez zmiany kształtu; `cli/definitions.ts` dostaje `export type { AstroVersionProvider } from '../types/cli-runtime.js'`.

#### 2. Adapter do `core/cli-runtime/`

**Plik**: `packages/astro/src/core/cli-runtime/build-time-astro-version-provider.ts` (nowy), stara ścieżka `cli/infra/build-time-astro-version-provider.ts` (shim)

**Cel**: przenieś klasę; jej import portu (stare `:1`) wskazuje na `types/cli-runtime.js`. Stara ścieżka zostaje jako re-eksport.

**Kontrakt**: klasa `BuildTimeAstroVersionProvider implements AstroVersionProvider` bez zmian ciała; `cli/infra/build-time-astro-version-provider.ts` → `export { BuildTimeAstroVersionProvider } from '../../core/cli-runtime/build-time-astro-version-provider.js'`.

#### 3. Repoint konsumentów

**Plik**: `core/dev/dev.ts:25`, `core/preview/static-preview-server.ts:12`, `vite-plugin-app/createAstroServerApp.ts:9`, `cli/index.ts:57`, `core/messages/runtime.ts:12` (ramię `AstroVersionProvider`), `cli/utils/format-version.ts:1`, `test/units/cli/index.test.ts:3`

**Cel**: przełącz importy na nowe domy. `runtime.ts:12` traci ostatnie ramię → **K2 domknięty**; `core/dev`, `core/preview`, `core/messages` bez żadnego importu z `cli/`.

**Kontrakt**: zmiana wyłącznie specyfikatorów importu; zero zmian użycia (`new BuildTimeAstroVersionProvider()`, `astroVersionProvider.version`).

### Kryteria sukcesu:

#### Automated Verification:

- Typecheck czysto: `npx tsc -b`
- Testy jednostkowe zielono (w tym `index.test`): `pnpm run test:unit`
- e2e `astro --version` zielono: `cli.test`
- Import `cli/definitions` spoza `cli/` = 0 (K2 domknięty): `grep`
- Value-import `build-time-astro-version-provider` spoza `cli/` wskazuje `core/cli-runtime/`: `grep`

#### Manual Verification:

- `astro --version`, `astro dev`, `astro preview` renderują banner wersji identycznie jak przed zmianą
- `core/dev`, `core/preview`, `core/messages` nie mają już żadnego importu z `cli/` (kandydaci do flipu per-warstwa w Fazie 6)
- Commit odwracalny

**Uwaga implementacyjna**: zatrzymaj się na ręczne potwierdzenie przed Fazą 6.

---

## Phase 6: Plik wyjątków + egzekwowanie per-warstwa + sprzątanie shimów

### Przegląd

Repoint pozostałych konsumentów wewn. `cli/` na nowe domy, usuń shimy, zbuduj plik wyjątków enumerujący każdą pozostałą krawędź `core→cli` z obowiązkowym uzasadnieniem, aktywuj walidację kompletności i flipnij strażnika **per-warstwa**.

### Wymagane zmiany:

#### 1. Repoint konsumentów wewn. `cli/` + usunięcie shimów

**Plik**: `cli/utils/format-version.ts:1`, `cli/infra/logger-help-display.ts:2`, `cli/index.ts` (dynamiczne importy adapterów), ścieżki portów w `cli/info/*` (`cli-debug-info-provider.ts:2`, `get-package-manager.ts:1`, `dev-debug-info-provider.ts` itd.); **testowi importerzy przeniesionych symboli** (importują z `dist/`, nie `src/`): `test/units/cli/utils.ts:12-18` (porty `AstroVersionProvider, CommandExecutorOptions, OperatingSystemProvider`), `test/units/cli/index.test.ts:6-7` (`PassthroughTextStyler, ProcessOperatingSystemProvider` — poza `:3`=BuildTime już repointowanym w Fazie 5), `test/units/cli/misc.test.ts:3` (`PassthroughTextStyler`); usuń re-eksporty z `cli/definitions.ts` i shimy z `cli/infra/*`

**Cel**: przełącz wszystkie pozostałe importy na `types/cli-runtime.js` (porty) i `core/cli-runtime/*` (adaptery) — dla testów odpowiednio `dist/types/cli-runtime.js` i `dist/core/cli-runtime/*` — po czym usuń shimy. Bez repointu testów usunięcie shimów urywa ich importy i kryterium 6.2 (`test:unit` zielono) czerwienieje. Repoint ścieżek w `cli/info` **nie przenosi** facetu — tylko aktualizuje skąd bierze porty.

**Kontrakt**: wyłącznie specyfikatory importu; po tym kroku `cli/definitions.ts` nie zawiera już przeniesionych portów ani ich re-eksportów.

#### 2. Plik wyjątków (aktywuje walidację kompletności)

**Plik**: `.dependency-cruiser.cjs` (sekcja wyjątków / `allowed`), ew. `packages/astro/layer-boundary-exceptions.md` (rejestr uzasadnień)

**Cel**: enumeruj **każdą** pozostałą krawędź `core→cli` z obowiązkowym uzasadnieniem. Po tym planie to **5 krawędzi `vite-plugin-app → cli/info/*`** (`:4-8`), każda uzasadniona: „odroczone do transzy `cli/info`; milestone: <id transzy>". Aktywacja pliku wyjątków włącza walidację kompletności.

**Kontrakt**: wpis per krawędź z polem `reason`/uzasadnieniem; brak uzasadnienia = błąd walidacji. Duch „kill-date" z `lessons.md`: każdy wyjątek ma milestone usunięcia.

#### 3. Flip strażnika per-warstwa

**Plik**: `eslint.config.js`, `.dependency-cruiser.cjs`

**Cel**: podnieś regułę do `error` dla warstw w pełni czystych: **`core/dev`, `core/preview`, `core/messages`** (zero krawędzi `cli/`). Dla `vite-plugin-app` — `error` dla ścieżek `cli/infra`, ale krawędzie `cli/info` pozostają dozwolone jako uzasadniony *warn* (z pliku wyjątków) do transzy facetu.

**Kontrakt**: severity per-warstwa; `core/*` i `types/*` → `error` na dowolny import `cli/**`; `vite-plugin-app` → `error` na `cli/infra/**`, `warn`+wyjątek na `cli/info/**`.

### Kryteria sukcesu:

#### Automated Verification:

- Typecheck czysto po usunięciu shimów: `npx tsc -b`
- `test:unit` + e2e zielono
- Value-importy `cli/infra` spoza `cli/` = 0; import `cli/definitions` spoza `cli/` = 0: `grep`
- Strażnik `error` dla `core/dev|core/preview|core/messages` nie zgłasza naruszeń; nieuzasadniona krawędź `core→cli` w tych warstwach łamie CI (test negatywny: wstrzyknięty import → red)
- dependency-cruiser: 0 nieuzasadnionych krawędzi; 5 krawędzi `cli/info` obecnych z uzasadnieniem

#### Manual Verification:

- Plik wyjątków wymienia dokładnie 5 krawędzi `cli/info`, każda z uzasadnieniem i milestonem
- Próbny import `cli/*` w `core/dev` jest odrzucany przez lint/CI (dowód egzekwowania)
- Żaden shim nie pozostał; stare ścieżki `cli/infra/*` przeniesionych adapterów nie istnieją
- Commit odwracalny; rejestr wyjątków czytelny dla przyszłej transzy `cli/info`

**Uwaga implementacyjna**: to ostatnia faza; po zielonych weryfikacjach automatycznych i ręcznym potwierdzeniu strażnik egzekwuje granice, a odroczony facet jest jawnie wytropiony.

---

## Strategia testowania

### Testy jednostkowe:

- **Charakteryzujące (nowe, najpierw)**: `TinyexecCommandExecutor.catch NonZeroExitError` (Faza 3a), `piccoloreTextStyler` (Faza 4a). Muszą być zielone *przed* jakąkolwiek edycją przenoszącą i *po* niej.
- **Istniejące osłony (nie ruszać, mają pozostać zielone)**: `index.test` (`BuildTime`, `ProcessOS`, `CliCommandRunner`, `LoggerHelpDisplay`), `misc.test` (`serverStart`), `cli.test` (`astro --version` e2e).

### Testy integracyjne:

- `astro --version`, `astro dev`, `astro preview` (banner wersji + styler), `astro info` (OS + executor) — ścieżki e2e przechodzące przez przeniesione adaptery; zielone po każdym slice.

### Kroki testowania ręcznego:

1. Po każdym slice: uruchom odpowiadającą komendę (`info` / `--version` / `dev` / `preview`) i porównaj output z baseline sprzed slice'a.
2. Po Fazie 6: wstrzyknij tymczasowy `import` z `cli/` do `core/dev/dev.ts` i potwierdź, że lint/CI go odrzuca (dowód egzekwowania), potem usuń.
3. Po Fazie 6: przejrzyj plik wyjątków — każda z 5 krawędzi `cli/info` ma uzasadnienie i milestone.

## Uwagi dotyczące wydajności

Brak implikacji runtime — relokacja + repoint, zero zmian ścieżek wykonania. Seam w `TinyexecCommandExecutor` (Faza 3a) to parametr z domyślną wartością; brak dodatkowego kosztu na ścieżce gorącej.

## Uwagi dotyczące migracji

Każdy slice zostawia shim re-eksportu → migracja inkrementalna, plik po pliku, w pełni odwracalna aż do usunięcia shimów w Fazie 6. Odroczony facet `cli/info/*` konsumuje przeniesione porty przez repoint ścieżki (Faza 6), więc transza facetu startuje z portami już w `types/` — nie wymaga cofania niczego z tego planu.

## Referencje

- Powiązane badania: `context/changes/large-scale-and-legacy-code/refactor-opportunities/research.md` (zweryfikowany ast-grep; sekcja „Weryfikacja twierdzeń")
- Dowody źródłowe: `context/changes/large-scale-and-legacy-code/cli-infra-data-flow/research.md`
- Porty (seam): `cli/definitions.ts:5-51`; K2: `core/messages/runtime.ts:12`; K1 value-importy: `core/dev/dev.ts:25-26`, `core/preview/static-preview-server.ts:12-13`, `vite-plugin-app/createAstroServerApp.ts:9-12`
- `CONTRIBUTING.md:394-402` — `types/` jako dom typów framework-neutralnych

## Progress

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dołącz ` — <commit sha>` po zakończeniu kroku. Nie zmieniaj nazw tytułów kroków. Tryb plan-only: weryfikacje opisane, nie uruchamiane w tej zmianie.

### Phase 1: Strażnik granic ląduje na zielono

#### Automated

- [ ] 1.1 Lint przechodzi (reguła w warn): `pnpm run lint:ci`
- [ ] 1.2 dependency-cruiser raportuje krawędzie jako warn: `pnpm run depcruise`
- [ ] 1.3 Typecheck bez zmian: `npx tsc -b`
- [ ] 1.4 CI zielone mimo istniejących naruszeń

#### Manual

- [ ] 1.5 Raport wymienia znane krawędzie core→cli (8 value + K2 + 5 cli/info) jako warn
- [ ] 1.6 Żadna reguła nie jest w error; walidacja kompletności nieaktywna

### Phase 2: Slice OperatingSystemProvider + ProcessOperatingSystemProvider

#### Automated

- [ ] 2.1 Typecheck czysto: `npx tsc -b`
- [ ] 2.2 test:unit zielono
- [ ] 2.3 Value-import process-os spoza cli wskazuje core/cli-runtime: `grep`

#### Manual

- [ ] 2.4 `astro info` renderuje OS identycznie; shim facetu kompiluje; commit odwracalny

### Phase 3: Slice CommandExecutor + TinyexecCommandExecutor

#### Automated

- [ ] 3.1 Test charakteryzujący Tinyexec (catch NonZeroExitError) zielony przed i po: `pnpm run test:unit`
- [ ] 3.2 Typecheck czysto: `npx tsc -b`
- [ ] 3.3 Value-import tinyexec spoza cli wskazuje core/cli-runtime: `grep`

#### Manual

- [ ] 3.4 `astro info` (ścieżka executor/`npm ls`) działa; komunikat błędu niezmieniony; commit odwracalny

### Phase 4: Slice TextStyler + piccolore + passthrough

#### Automated

- [ ] 4.1 Test charakteryzujący piccolore zielony przed i po przenosinach: `pnpm run test:unit`
- [ ] 4.2 Typecheck czysto: `npx tsc -b`
- [ ] 4.3 serverStart (misc.test) zielono
- [ ] 4.4 runtime.ts:12 nie importuje już TextStyler z cli/definitions: `grep`

#### Manual

- [ ] 4.5 Banner serverStart identyczny wizualnie; commit odwracalny

### Phase 5: Slice AstroVersionProvider + BuildTimeAstroVersionProvider

#### Automated

- [ ] 5.1 Typecheck czysto: `npx tsc -b`
- [ ] 5.2 test:unit zielono (index.test): `pnpm run test:unit`
- [ ] 5.3 e2e `astro --version` zielono: `cli.test`
- [ ] 5.4 Import cli/definitions spoza cli = 0 (K2 domknięty): `grep`
- [ ] 5.5 Value-import build-time spoza cli wskazuje core/cli-runtime: `grep`

#### Manual

- [ ] 5.6 `--version`/`dev`/`preview` renderują banner identycznie
- [ ] 5.7 core/dev, core/preview, core/messages bez importu z cli; commit odwracalny

### Phase 6: Plik wyjątków + egzekwowanie per-warstwa + sprzątanie shimów

#### Automated

- [ ] 6.1 Typecheck czysto po usunięciu shimów: `npx tsc -b`
- [ ] 6.2 test:unit + e2e zielono
- [ ] 6.3 Value-importy cli/infra spoza cli = 0; import cli/definitions spoza cli = 0: `grep`
- [ ] 6.4 Strażnik error dla core/dev|core/preview|core/messages; wstrzyknięty import cli/* → CI red
- [ ] 6.5 dependency-cruiser: 0 nieuzasadnionych krawędzi; 5 krawędzi cli/info z uzasadnieniem

#### Manual

- [ ] 6.6 Plik wyjątków: dokładnie 5 krawędzi cli/info, każda z uzasadnieniem i milestonem
- [ ] 6.7 Próbny import cli/* w core/dev odrzucony przez lint/CI (dowód egzekwowania)
- [ ] 6.8 Żaden shim nie pozostał; stare ścieżki przeniesionych adapterów nie istnieją; commit odwracalny
