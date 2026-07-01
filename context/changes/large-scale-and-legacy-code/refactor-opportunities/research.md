---
date: 2026-07-01T10:52:22+0200
researcher: karczynski_t
git_commit: 1755624c086347683176493b16d7255b9f0ada5c
branch: main
repository: withastro/astro (read-only clone at astro-legacy-analysis/ @ e37dfe2a762; host repo 10xDEVS @ 1755624)
topic: "Refactor opportunities — ranking długu z raportu cli-infra-data-flow"
tags: [research, codebase, refactor-opportunities, cli-infra, layer-leak, dependency-inversion, feasibility, verified]
status: complete
last_updated: 2026-07-01
last_updated_by: karczynski_t
last_updated_note: "Reklasyfikacja N1–N6 (N2/N3 czysty test; N1/N5/N6 seam; N4 eksport) + weryfikacja twierdzeń strukturalnych ast-grep 0.44.0 — 0 obalonych, 0 doprecyzowanych, wszystkie linie potwierdzone co do wiersza."
verification_commit: e37dfe2a7623acd364d7e3556ecc9b31e3e45520
---

# Research: Refactor opportunities (ranking długu z raportu `cli-infra-data-flow`)

**Date**: 2026-07-01T10:52:22+0200
**Researcher**: karczynski_t
**Host git commit**: `1755624` (10xDEVS, branch main)
**Analyzed code**: `withastro/astro` @ `e37dfe2a7623acd364d7e3556ecc9b31e3e45520` — read-only klon w `astro-legacy-analysis/`
**Primary evidence source**: `context/changes/large-scale-and-legacy-code/cli-infra-data-flow/research.md`

> Permalink-base (ścieżki względem `packages/astro/src/`):
> `https://github.com/withastro/astro/blob/e37dfe2a7623acd364d7e3556ecc9b31e3e45520/packages/astro/src/<plik>#L<linia>`

## Research Question

Analiza `cli-infra-data-flow/research.md` celowo zostawiła otwarte pytanie: **KTÓRE z udokumentowanych problemów warto naprawić, w jakim docelowym kształcie i w jakiej kolejności.** Ta zmiana: wypisuje każdy problem, który tamten raport odnotowuje; klasyfikuje go (KANDYDAT = naprawa zmienia strukturę kodu; reszta = wejście do oceny kosztu); bada każdego kandydata trzema wymiarami (obecny kształt / historia i intencjonalność / wykonalność migracji); kończy rankingiem refactor opportunities. **Żaden refaktor ani decyzja tu nie zapada** — ranking to propozycja dla osobnej sesji planowania.

## Konwencja pewności

- **[E] EVIDENCE** — przeczytane w kodzie/gicie, z `file:line` lub hashem commita.
- **[I] INFERENCE** — interpretacja na bazie dowodów.
- **[U] UNKNOWN** — biała plama / poza zasięgiem tej rundy.

---

## Summary

- **Raport `cli-infra-data-flow` odnotowuje 8 problemów. Dokładnie 2 są KANDYDATAMI** (naprawa zmienia strukturę kodu): **K1** — przeciek *implementacji* `cli/infra/*` do `core/` (odwrócona zależność `core→cli`); **K2** — przeciek *kontraktu typów* `cli/definitions.ts` do `core/messages/runtime.ts`. Pozostałe 6 (N1–N6) to luki testowe / test-smell — nie kandydaci, ale wchodzą jako *ryzyko migracji* (część adapterów, które chcemy przenieść, jest nietestowana). [E]
- **Odkrycie ponad raport (subagent „obecny kształt"): trzeci facet tego samego smellu.** `vite-plugin-app/createAstroServerApp.ts:4-8` importuje jeszcze **5 klas z `cli/info/*`** (`get-package-manager`, `DevDebugInfoProvider`, `process-node-version-provider`, `process-package-manager-user-agent-provider`, `styled-debug-info-formatter`) — ta sama inwersja `core-warstwa→cli`, poza zakresem K1. [E] Rozszerza blast radius K1, nie zmienia werdyktu.
- **Intencjonalność (subagent „historia"): zachowanie jest nośne i celowe; architektura (`core→cli`) — nie.** Żaden ADR ani `CONTRIBUTING.md` nie sankcjonuje `cli/` jako warstwy współdzielonej [E]. Porty/adaptery powstały **przez i dla CLI** (refaktor hexagonalny Floriana Lefebvre, X–XI 2025); `core/` i `vite-plugin-app` „sięgnęły do nich" **miesiące później** (#14306 Env API, XII 2025; #15639 „speedup test", II 2026). Inwersja to **skostniałe reuse**, nie zaprojektowane ograniczenie. [E/I] → dług realny do spłaty, nie decyzja nośna, którą trzeba by respektować.
- **Wykonalność (subagent „migracja"): twardy porządek K2→K1, oba odwracalne, ale brakuje strażnika granicy.** K2 jest **type-only** → łapany przez `tsc -b`/`test:types`, zerowe ryzyko runtime. K1 to importy *value* (`new X()`), ale przenosiny to **czyste przepisanie ścieżek importu**, nie przebudowa grafu DI. **K1 nie da się czysto naprawić bez K2 najpierw** (adaptery importują swój port z `cli/definitions.ts`). **CI nie ma reguły granic warstw** (`no-restricted-imports`/zones, dependency-cruiser) — łapie zerwaną ścieżkę, nigdy kierunek zależności → bez reguły smell odrośnie. [E]

---

## Audytowalna lista problemów z raportu + klasyfikacja

| # | Problem odnotowany w raporcie | Sekcja raportu | Klasa |
|---|---|---|---|
| **K1** | Przeciek *implementacji* `cli/infra/*` poza CLI — 3 pliki / 8 linii; odwrócona zależność `core→cli` | §A, §C, Summary | **KANDYDAT** |
| **K2** | Przeciek *kontraktu typów* `cli/definitions.ts` — `core/messages/runtime.ts:12` importuje porty `AstroVersionProvider, TextStyler` | §A (C4), §C | **KANDYDAT** |
| N1 | `TinyexecCommandExecutor.execute()` niepokryty (cała klasa + catch `NonZeroExitError`) | §B.1 | nie-kandydat — **luka testowa + seam** (twardy `import { x } from 'tinyexec'`, brak wstrzyknięcia) |
| N2 | `npm/pnpm/yarn getPackageVersion()` — parsowanie JSON/NDJSON niepokryte | §B.2 | nie-kandydat — **czysta luka testowa** (`commandExecutor` wstrzykiwany → fake bez zmian kodu) |
| N3 | `StyledDebugInfoFormatter.format()` niepokryty | §B.3 | nie-kandydat — **czysta luka testowa** (`textStyler` wstrzykiwany → fake bez zmian kodu) |
| N4 | `cli/index.ts` `resolveCommand`/`runCommand` bez testu jednostkowego | §B.4 | nie-kandydat — **luka testowa + eksport** (`resolveCommand` czysta, ale prywatna w module) |
| N5 | `CliAstroConfigResolver.resolve()` niepokryty | §B.5 | nie-kandydat — **luka testowa + seam** (twardy `import { resolveConfig }` z `core/config`) |
| N6 | `TinyclipClipboard.copy()` catch niepokryty + test-smell (realny `writeText` w CI) | §B.6 | nie-kandydat — **luka testowa + seam** (twardy `import { writeText } from 'tinyclip'`; test-smell nieusuwalny bez seamu) |

**Dlaczego N1–N6 nie są kandydatami:** żaden nie jest relokacją warstw w sensie K1/K2 (nie zmienia grafu zależności `core→cli`). **Ale „naprawa = tylko dodanie testu" jest prawdziwe wyłącznie dla N2 i N3 [E]** — oba wstrzykują swojego współpracownika (`commandExecutor` / `textStyler` przez konstruktor), więc testuje się je fake'iem bez dotykania kodu. **N1, N5, N6 twardo importują zależność zewnętrzną** (`tinyexec` `x`, `core/config` `resolveConfig`, `tinyclip` `writeText`) — nie mają seamu, więc charakteryzacja w stylu projektu (DI+fakes) wymaga **najpierw wstrzyknięcia seamu = mała zmiana strukturalna**. Szczególnie **N6**: udokumentowanego test-smellu (realny `writeText` w CI) nie da się czysto usunąć bez wstrzyknięcia writera — to nie sama higiena testów, tylko refaktor „uczyń testowalnym". **N4** to czysta funkcja `resolveCommand` (flags→`CLICommand`), ale prywatna w module (`function`, nie eksportowana) → test jednostkowy wymaga jej **eksportu** (trywialna, ale realna edycja). **Korekta priora:** wcześniejsze „naprawa to dodanie testu, nie zmiana struktury" było za czyste — trzyma się dla N2/N3, dla N1/N5/N6 poprawka ciągnie seam, dla N4 eksport. [E]

Zachowane jako wejście do oceny kosztu — patrz „Ryzyko migracji" niżej: N1/N2/N3/N4 pokrywają się z kodem dotykanym przez K1, więc ich brak podnosi ryzyko regresji podczas migracji. **Uwaga o koszcie:** dla N1 (i N6-analogu w facecie `cli/info/*`) krok „obłóż testem przed przenosinami" sam ciągnie refaktor-seam — nie jest samym testem — więc realny koszt odryzykowania K1 jest o tyle wyższy, niż sugerowałaby etykieta „luka testowa".

**Utajone kruchości znalezione przy ponownej lekturze (niski priorytet, nie wymagają zmiany dziś) [E]:** (a) **N3** — `' '.repeat(this.#maxPadding - label.length)` rzuci `RangeError` dla etykiety ≥ 25 znaków; obecne etykiety krótsze (`"Package Manager"` = 15) → nieosiągalne, ale `Math.max(0, …)` by zabezpieczyło. (b) **N2** — `astro ? \`v${astro.dependencies[name].version}\` : undefined` rzuca, gdy `astro.dependencies[name]` nie istnieje, ale `catch` zjada → cicho `undefined` (zgodne z raportem „cicho raportuje złe/undefined wersje").

**Priory z `repo-map.md` (poza profilem tego raportu)** — cykle render-pipeline (49 cykli w `runtime/server/render`), kontrakt `types/public/config.ts`+`core/config`, in-degree `core/errors`/`core/constants`, bus factor ≈ 1. Rozważone i **odrzucone jako poza zakresem** — patrz sekcja końcowa; raport wprost stwierdza, że jego profil to *nie* render-pipeline.

---

## Detailed Findings — per kandydat

### Kandydat K1 — przeciek implementacji `cli/infra/*` do `core/`

#### Obecny kształt (dowody)

**[E]** Dokładnie 3 pliki / 8 linii importują konkretne klasy `cli/infra/*` spoza `cli/`, wszystkie jako importy **value** (`new X()` / const):

| Konsument (file:line import → użycie) | Symbol | Rodzaj |
|---|---|---|
| `core/dev/dev.ts:25` → `:133` | `BuildTimeAstroVersionProvider` | value (`new`) |
| `core/dev/dev.ts:26` → `:134` | `piccoloreTextStyler` | value (const) |
| `core/preview/static-preview-server.ts:12` → `:99` | `BuildTimeAstroVersionProvider` | value (`new`) |
| `core/preview/static-preview-server.ts:13` → `:100` | `piccoloreTextStyler` | value (const) |
| `vite-plugin-app/createAstroServerApp.ts:9` → `:33` | `BuildTimeAstroVersionProvider` | value (`new`) |
| `vite-plugin-app/createAstroServerApp.ts:10` → `:42` | `PassthroughTextStyler` | value (`new`) |
| `vite-plugin-app/createAstroServerApp.ts:11` → `:34` | `ProcessOperatingSystemProvider` | value (`new`) |
| `vite-plugin-app/createAstroServerApp.ts:12` → `:37` | `TinyexecCommandExecutor` | value (`new`) |

**[E]** Fan-out per symbol: `BuildTimeAstroVersionProvider` ← wszystkie 3 pliki (najbardziej przeciekający); `piccoloreTextStyler` ← dev+preview; pozostałe ← tylko vite-plugin-app.

**[E]** Dlaczego `core` ich potrzebuje: dev/preview renderują banner `serverStart` (wersja + styler); `createAstroServerApp` składa debug-info w stylu `astro info` (wersja + OS + executor + no-op styler). Odpowiedzialności są czyste (I/O adaptery), nie mieszane — problemem jest *lokalizacja*, nie spójność klas.

**[E]** Istniejący seam: `cli/definitions.ts` deklaruje 6 portów-interfejsów + 1 typ-opcje; każda klasa `cli/infra/*` ma `implements` na swoim porcie (wyjątek: `piccoloreTextStyler` to typowany const `: TextStyler`, nie `implements`). Dwa adaptery **nie przeciekają** (`LoggerHelpDisplay`, `CliCommandRunner`) — tylko `cli/index.ts`. Seam port/adapter *już istnieje* — brakuje tylko neutralnej lokalizacji.

**[E]** Trzeci facet (odkrycie ponad raport): `vite-plugin-app/createAstroServerApp.ts:4-8` importuje dodatkowo 5 klas z `cli/info/*` (`get-package-manager`, `DevDebugInfoProvider`, `process-node-version-provider`, `process-package-manager-user-agent-provider`, `styled-debug-info-formatter`). Ta sama inwersja, inny podkatalog `cli/`. **[U]** własny plik portów `cli/info/definitions.ts` niezbadany.

**[E]** Brak istniejącego neutralnego domu: `src/` nie ma `shared/`/`common/`/`core/infra/`/`di/`. Istnieją `core/util/`, `core/util.ts` (generyczne helpery), ale czy to zamierzony dom dla tych adapterów — **[U]**. `src/container/` to Container render API, **nie** kontener DI. **[E]**

#### Werdykt intencjonalności

**[I] Zachowanie nośne i celowe; architektura (`core→cli`) — skostniałe reuse, nie zaprojektowane ograniczenie.**
- **[E]** Adaptery powstały CLI-owned first: seria `refactor(cli):` Floriana Lefebvre (`cd30254301b` create-key #14501, `63b256839f3` help #14595 — tworzy `definitions.ts`+`build-time-astro-version-provider.ts`, `0d84321024f` #14722, `6751a2e4cd4` classes #14897), X–XI 2025. Jedyny konsument przy narodzinach = CLI.
- **[E]** Krawędzie `core→cli` dodane **później**: `vite-plugin-app` w `141c4a26419` „Environment API (#14306)" (Emanuele Stoppa, XII 2025, reuse maszynerii `astro info`); `core/dev`+`core/preview` w `3f108d61cdb` „chore(cli): speedup test (#15639)" (Florian Lefebvre, II 2026, motyw = seam DI do testów). Pickaxe potwierdza: linie importu były net-new w tych commitach.
- **[E]** Żaden ADR ani `CONTRIBUTING.md:394-402` nie ustanawia granicy `core→cli` — opis warstw jest **deskryptywny, nie preskryptywny**; nic nie zabrania `core` importować `cli`, nic nie mianuje `cli/` domem współdzielonym.
- **[U]** Głębszy motyw (czy świadomie zdecydowano *nie* relokować portów do neutralnego modułu) żyje w wątkach PR #14306/#15639 na GitHub, nie w gicie.
- **Korekta priora:** raport wiązał genezę przecieku z commitami X/XI 2025; faktycznie *krawędzie importu* `core→cli` narodziły się później (#14306 XII 2025, #15639 II 2026). Geneza *portów/adapterów* (X/XI) i geneza *przecieku* (XII–II) to różne momenty.

#### Notatki o wykonalności

- **[E] Docelowy kształt (jedna fraza):** współdzielony, neutralny moduł infra/adapterów na poziomie `core/` (np. `core/cli-runtime/`), do którego przenoszą się przeciekające adaptery. **Brak potrzeby nowej granicy pakietu** — reuse istniejącego drzewa `core/`.
- **[E] Blast radius (przenosiny najbardziej przeciekającego `build-time-astro-version-provider.ts`): 5 edycji src + 1 edycja testu = 6 miejsc, wszystkie mechaniczne przepisania ścieżki importu**, bez przebudowy grafu DI: (1) `cli/infra/build-time-astro-version-provider.ts:1` (type-only import portu — sprzężenie K1→K2), (2) `cli/index.ts:57` dynamiczny `import()`, (3) `core/dev/dev.ts:25`, (4) `core/preview/static-preview-server.ts:12`, (5) `vite-plugin-app/createAstroServerApp.ts:9`, (6) `test/units/cli/index.test.ts:3` (import po ścieżce `dist/`). Cztery konsumenty robią `new X()` bezpośrednio — brak fabryki/rejestru do rozplątania. **[E]**
- **[E] Osłony istniejące:** `BuildTimeAstroVersionProvider` — unit `index.test.ts:52` + integracja `cli.test.ts:66` (`astro --version` e2e). `ProcessOperatingSystemProvider`, `CliCommandRunner`, `LoggerHelpDisplay` — `index.test.ts`. Konsument K2 `serverStart` — `misc.test.ts:4` z `FakeAstroVersionProvider`+`PassthroughTextStyler`.
- **[E] Nieosłonięte (ryzyko migracji — pokrywa się z N1–N4):** `TinyexecCommandExecutor.execute` (testy podstawiają `SpyCommandExecutor`), `piccoloreTextStyler` (testy używają tylko `PassthroughTextStyler`), `getPackageManager` parsowanie UA, `StyledDebugInfoFormatter.format`, `resolveCommand`/`runCommand`. `createAstroServerApp` i `static-preview-server` nie są importowane przez żaden test wprost (osłona tylko pośrednia przez fixture dev/preview).
- **[E] CI (`.github/workflows/ci.yml`):** na PR — `typecheck` (`tsc -b`), `test:types`, `lint:ci` (knip+eslint), `test:unit`+`test:integration` (matrix ubuntu/macos/windows × node 22/24), e2e, smoke. Przenosiny value: złapane przez `tsc -b` (zerwana ścieżka src) **oraz** unit-test (import po `dist/`) **oraz** `cli.test.ts` e2e. **[E] Krytyczna luka: brak reguły granic** — `eslint.config.js` nie ma `no-restricted-imports`/zones, brak dependency-cruiser w pakiecie astro. CI pilnuje *poprawności ścieżki*, nigdy *kierunku warstwy* → ponowne wprowadzenie przecieku przejdzie CI na zielono.
- **[E] Odwracalność:** każdy plik przenoszony z shim-em re-eksportu na starej ścieżce → w pełni odwracalne, inkrementalne (plik po pliku).

---

### Kandydat K2 — przeciek kontraktu typów `cli/definitions.ts` do `core/`

#### Obecny kształt (dowody)

**[E]** `core/messages/runtime.ts:12`: `import type { AstroVersionProvider, TextStyler } from '../../cli/definitions.js';` — **jedyny** importer `cli/definitions.js` spoza `cli/` (grep = 1 trafienie). Typy to parametry `serverStart(...)` (`:68-77`), używane w całym ciele (`textStyler.dim/cyan/bgGreen`, `astroVersionProvider.version`).
**[E]** `cli/utils/format-version.ts:1` konsumuje te same porty, ale jest **wewnątrz** `cli/` (nie przeciek).
**[E]** Oba importy są **type-only** (`import type`) — kasowane w kompilacji, zerowa zależność runtime.

#### Werdykt intencjonalności

**[I] Seam DI celowy (testowalność); lokalizacja portu w `cli/` — incydentalna.**
- **[E]** Wprowadzony w `3f108d61cdb` „chore(cli): speedup test (#15639)" (II 2026). Diff pokazuje: `runtime.ts` wcześniej brał dane **bez zależności od `cli`** (`process.env.PACKAGE_VERSION`, destrukturyzowany `piccolore` bezpośrednio) i został zrefaktorowany na **wstrzykiwane porty**. Ten sam commit usuwa 43 linie `test-utils.js`, dodaje `misc.test.js` (+133) → motyw = seam do testów.
- **[I]** Uczynienie `serverStart` renderującym z wstrzykniętych `TextStyler`/`AstroVersionProvider` to celowy ruch. Ale *import tych typów z `cli/definitions.ts`* to decyzja-lokalizacja-z-wygody (reuse istniejących portów CLI zamiast zdefiniowania `core`-owned), nie zadeklarowane ograniczenie.
- **[U]** Rationale z PR #15639 poza gitem.

#### Notatki o wykonalności

- **[E] Docelowy kształt (jedna fraza):** neutralny moduł portów na poziomie `core/`/`types/` (interfejsy są framework-neutralne: wersja-string, styler ANSI). **Nie jest to przeprojektowanie pojęcia biznesowego** — czysta relokacja kontraktu technicznego, brak stop-flagi.
- **[E] Blast radius:** type-only w każdym konsumencie — `runtime.ts:12`, `format-version.ts:1` oraz wszystkie 7 implementerów `cli/infra/*` (`import type … from '../definitions.js'`). Przenosiny + repoint = zmiana specyfikatorów, kasowana przy buildzie, zero zmiany runtime.
- **[E] Osłona:** `tsc -b` (typecheck) + `test:types` złapią każdy zwisający/przemieszczony import typu. Nie ma zachowania runtime, które mogłoby się prześliznąć.
- **[E] Odwracalność / niezależność:** K2 jest niezależnie przesuwalny i **musi iść pierwszy (lub razem z K1)**. Ograniczenie porządku jednokierunkowe: adaptery `cli/infra/*` importują swój port z `cli/definitions.ts`; jeśli przeniesiesz *klasę* (K1) zostawiając *typ* w `cli/`, klasa odtwarza słabszą (type-only) krawędź `core→cli` — przeciek naprawiony połowicznie. **K2 nigdy nie zależy od K1.**

---

## Refactor opportunities (ranking — propozycja do sesji planowania)

> Dwa kandydaty strukturalne, jeden smell (`cli/`→`core/` inwersja), twardy porządek **K2 → K1**. Ranking oddaje „najlepszą okazję do ruszenia" = wartość × wykonalność, nie tylko wielkość długu.

### #1 — K2: relokacja seamu typów z `cli/definitions.ts` do neutralnego modułu portów (ruch-klucz)

- **Obecny → docelowy:** porty `AstroVersionProvider`, `TextStyler` (i pozostałe konsumowane) żyją w `cli/definitions.ts` → neutralny moduł portów na poziomie `core/`/`types/`; `core/messages/runtime.ts:12` repointowany; shim re-eksportu w `cli/definitions.ts` dla implementerów CLI.
- **Czemu #1 (koszt długu vs koszt zmiany):** najlepszy stosunek. Koszt długu umiarkowany (jedna krawędź type-only), ale **koszt zmiany minimalny** (type-only, `tsc`-guarded, zero runtime) i **odblokowuje K1** (twarde ograniczenie porządku). Bez K2 najpierw, K1 nie da się domknąć.
- **Blast radius:** type-only; `runtime.ts:12` + `format-version.ts:1` + 7 implementerów `cli/infra/*`. Łapane w całości przez `tsc -b`/`test:types`. **[E]**
- **Szkic ścieżki inkrementalnej:** (1) utwórz neutralny plik portów, przenieś interfejsy, zostaw re-eksport w `cli/definitions.ts`; (2) repoint `core/messages/runtime.ts:12`; (3) opcjonalnie repoint konsumentów CLI, potem usuń shim.
- **Pierwszy krok-prerekwizyt:** przenieś dwa porty konsumowane przez `core` (`AstroVersionProvider`, `TextStyler`) do neutralnego modułu i repoint `runtime.ts:12`, zostawiając re-eksport. Type-only → odwracalne, zero ryzyka runtime.

### #2 — K1: relokacja przeciekających adapterów `cli/infra/*` (+ facet `cli/info/*`) do neutralnego domu

- **Obecny → docelowy:** konkretne adaptery I/O (`build-time-astro-version-provider`, `piccolore`/`passthrough-text-styler`, `process-operating-system-provider`, `tinyexec-command-executor`; oraz maszyneria `cli/info/*` używana przez `vite-plugin-app`) żyją pod `cli/` → współdzielony neutralny moduł infra na poziomie `core/` (np. `core/cli-runtime/`). Konsumenci `core/dev`, `core/preview`, `vite-plugin-app` importują z neutralnego domu; `cli/index.ts` też.
- **Czemu #2:** **większy dług** (realna odwrócona zależność runtime — refaktor „CLI" łamie serwer dev/preview i plugin Vite środowiska), ale **większy koszt zmiany** (importy value, ≥6 miejsc/plik, część adapterów nietestowana — N1/N2/N3) i **musi iść po K2**.
- **Blast radius:** per plik ~6 mechanicznych przepisań ścieżki (przykład `build-time-…` wyżej); `BuildTimeAstroVersionProvider` najszerszy (3 konsumenci + `cli/index.ts` + test). Facet `cli/info/*` dokłada 5 importów w `vite-plugin-app`. Osłony: `index.test.ts`, `cli.test.ts` (e2e `--version`), `misc.test.ts`. Nieosłonięte: `tinyexec`, `piccolore`, PM-parsing, formatter (ryzyko cichej regresji przy przenosinach).
- **Szkic ścieżki inkrementalnej:** po K2 — przenoś **plik po pliku**, od najbardziej przeciekającego (`build-time-astro-version-provider.ts`), każdy z shim-em re-eksportu; repoint konsumentów; na końcu usuń shimy. Facet `cli/info/*` jako osobna, późniejsza transza.
- **Pierwszy krok-prerekwizyt:** **dodać regułę granic warstw** (`eslint no-restricted-imports`/zones lub dependency-cruiser w pakiecie astro) — bez niej smell odrośnie (CI pilnuje ścieżki, nie kierunku). Reguła najpierw jako *warn* na istniejących krawędziach, potem *error* po domknięciu migracji. Dopiero potem pierwsza przenosina pliku.

> **Uwaga o ryzyku dla #2:** N1–N4 (nietestowane realne adaptery: `TinyexecCommandExecutor`, PM-parsing, `StyledDebugInfoFormatter`, `resolveCommand`/`runCommand`) pokrywają się z kodem dotykanym przez K1. Nie są kandydatami (nie zmieniają grafu warstw), ale **charakteryzacja adaptera testem przed jego przenosinami** obniżyłaby ryzyko cichej regresji. **Zastrzeżenie [E]:** dla `TinyexecCommandExecutor` (N1) ta charakteryzacja wymaga *najpierw* wstrzyknięcia seamu (twardy `import { x } from 'tinyexec'`) — czyli mały refaktor, nie sam test; dla `StyledDebugInfoFormatter`/PM-parsing (N3/N2) wystarczy fake (współpracownik już wstrzykiwany). To wejście do planu #2, nie osobny refaktor.

---

## Kandydaci rozważeni i odrzuceni

| Kandydat | Dlaczego odrzucony |
|---|---|
| **N1–N6 (luki testowe / test-smell)** | Żaden nie jest relokacją warstw (K1/K2). Ale naprawa „samym testem" dotyczy **tylko N2, N3** (współpracownik wstrzykiwany). **N1, N5, N6 twardo importują zależność zewnętrzną** (`tinyexec`/`resolveConfig`/`writeText`) → czysty test wymaga wpierw **wstrzyknięcia seamu = mała zmiana kodu**; N6 (`writeText` w CI) nieusuwalny bez tego seamu (nie sama higiena). **N4** = eksport prywatnej fn. Nadal nie-kandydaci (nie zmieniają grafu warstw), ale **nie „zero kodu"**. Zachowane jako *wejście do kosztu*: N1–N4 podnoszą ryzyko migracji K1. [E] |
| **`runCommand`/`resolveCommand` jako „za duży composition root"** | Rozważony jako możliwy kandydat strukturalny (ręczny root DI, 9 dynamicznych `import()`). Odrzucony: raport ramuje to jako *nietestowane* (N4), nie *źle ustrukturyzowane*, i **chwali** DI-by-hand jako testowalne (DI+fakes). Brak dowodu na smell strukturalny — tylko lukę testu. |
| **Cykle render-pipeline (49 cykli w `runtime/server/render`)** | Strukturalne, ale **poza profilem tego raportu** — raport wprost: „nie render-pipeline, tylko nietestowane adaptery I/O + composition root". Repo-map §4 wskazuje je jako osobną strefę. Przedmiot innej, repo-wide analizy. |
| **Kontrakt `types/public/config.ts` + `core/config`** | Publiczny kontrakt zmieniany przez każdy feature (repo-map §3). Strukturalny, ale poza zakresem raportu cli-infra; naprawa dotyka API użytkowników (breaking-change) — inna klasa ryzyka. |
| **In-degree `core/errors`/`core/constants`, bus factor ≈ 1** | Repo-map §4/§5. Nie „przeciek warstw" — to głębokie moduły i skupienie wiedzy; nie ma tu naprawy zmieniającej strukturę w sensie tego raportu. |

---

## Weryfikacja twierdzeń (ast-grep)

**Metoda:** twierdzenia strukturalne, na których stoi ranking, zweryfikowane `ast-grep 0.44.0` na klonie `astro-legacy-analysis @ e37dfe2a762` (2026-07-01). Każde **zero z ast-grep kontrowane klasycznym `grep`** (realny brak vs artefakt wzorca) — reguła z raportu źródłowego (C9). **Ujawniony artefakt narzędzia:** ast-grep rozróżnia styl cudzysłowu w literałach stringów — wzorzec `from "$SRC"` NIE łapie kodu pisanego `'...'`; poprawne wyniki dały wzorce z `'$SRC'`. Pierwsze zera przy S1/S8/N2/N3 były artefaktem cudzysłowu/adnotacji typu, nie realnym brakiem — potwierdzone grepem. **Wynik: 0 obalonych, 0 doprecyzowanych — wszystkie numery linii potwierdzone co do wiersza, brak korekt in-place.**

| # | Twierdzenie | Werdykt | Dowód (plik:linia) | Metoda (wzorzec/reguła) |
|---|---|---|---|---|
| S1 | 3 pliki / 8 linii value-import `cli/infra/*` spoza `cli/` | ✅ potwierdzone | `core/dev/dev.ts:25,26`; `core/preview/static-preview-server.ts:12,13`; `vite-plugin-app/createAstroServerApp.ts:9,10,11,12` | inline-rule `import { $$$ } from '$SRC'` + `SRC~cli/infra`; ast-grep=8, grep=8 |
| S1' | call-sites (użycie `new X`/const) tabeli K1 | ✅ potwierdzone | `dev.ts:133,134`; `static-preview-server.ts:99,100`; `createAstroServerApp.ts:33,34,37,42` | grep `new X` |
| S2 | Fan-out: BuildTime←3, piccolore←2, passthrough/OS/tinyexec←1 | ✅ potwierdzone | rozkład plików z S1 | pochodne z S1 |
| S3 | `cli/definitions.ts`: 6 portów + 1 typ-opcje = 7 interfejsów | ✅ potwierdzone | `cli/definitions.ts:5,10,20,24,31,39,47` (`CommandExecutorOptions`:31 = typ-opcje) | `interface $I { $$$ }`; ast-grep=7, grep=7 |
| S4 | 6 klas `implements` + 1 const (`piccoloreTextStyler`) | ✅ potwierdzone | 6 klas w `cli/infra/*`; const `piccolore-text-styler.ts` | `class $C implements $I`; ast-grep=6 |
| S5 | `LoggerHelpDisplay`+`CliCommandRunner` NIE przeciekają (tylko `cli/index.ts`) | ✅ potwierdzone | `cli/index.ts:58,59` (dynamiczny `import()`); brak statycznych spoza `cli/` | grep (zero z ast-grep potwierdzone grepem) |
| S6 | `createAstroServerApp.ts:4-8` — 5 klas z `cli/info/*` | ✅ potwierdzone | `vite-plugin-app/createAstroServerApp.ts:4,5,6,7,8` | inline-rule `SRC~cli/info`; ast-grep=5 |
| S7 | `cli/index.ts:57` dynamiczny `import()` build-time | ✅ potwierdzone | `cli/index.ts:57` | grep `import(` |
| S8 | `runtime.ts:12` jedyny importer `cli/definitions` spoza `cli/` | ✅ potwierdzone | `core/messages/runtime.ts:12` | inline-rule `SRC~cli/definitions`; ast-grep=1, grep=1 |
| S9 | 7 implementerów `import type` z `definitions` | ✅ potwierdzone | 7 plików `cli/infra/*` | inline-rule `import type … '$SRC'` + `SRC~definitions`; ast-grep=7 |
| N1 | `TinyexecCommandExecutor`: twardy `import {x} from 'tinyexec'`, brak seamu | ✅ potwierdzone | `cli/infra/tinyexec-command-executor.ts:1`; 0 konstruktorów | pattern import; grep `-c constructor`=0 |
| N2 | `NpmPackageManager`: `commandExecutor` wstrzykiwany | ✅ potwierdzone | `cli/info/infra/npm-package-manager.ts:13-14` | pattern `this.#commandExecutor = commandExecutor` |
| N3 | `StyledDebugInfoFormatter`: `textStyler` wstrzykiwany | ✅ potwierdzone | `cli/info/infra/styled-debug-info-formatter.ts:9,14` | pattern `this.#textStyler = textStyler` |
| N4 | `resolveCommand`: czysta fn prywatna (nie `export`) | ✅ potwierdzone | `cli/index.ts:19` | grep: `export function`=0, `function`=1 |
| N5 | `CliAstroConfigResolver`: twardy `import {resolveConfig}` | ✅ potwierdzone | `cli/info/infra/cli-astro-config-resolver.ts:1` | pattern import `resolveConfig` |
| N6 | `TinyclipClipboard`: twardy `import {writeText} from 'tinyclip'`, użyty bezpośrednio | ✅ potwierdzone | `cli/info/infra/tinyclip-clipboard.ts:3,31` | pattern import; grep `writeText` |

**Wpływ na kandydatów:** żaden wynik nie podważa pozycji K1 ani K2 — strukturalny szkielet obu (8 przecieków value / 3 pliki, 1 przeciek typu, 7 portów, seam port/adapter, 7 implementerów) potwierdzony co do wiersza. Reklasyfikacja N1–N6 (N2/N3 czysty test; N1/N5/N6 seam; N4 eksport) potwierdzona narzędziowo. Brak twierdzenia wymagającego adnotacji „do decyzji na etapie planowania".

---

## Code References

- `cli/definitions.ts:5-51` — porty (seam) CLI: `HelpDisplay`(:5), `TextStyler`(:10), `AstroVersionProvider`(:20), `CommandRunner`(:24), `CommandExecutor`+`CommandExecutorOptions`(:31-45), `OperatingSystemProvider`(:47)
- `core/messages/runtime.ts:12` — **K2**: `import type { AstroVersionProvider, TextStyler }` z `cli/definitions.js`
- `core/dev/dev.ts:25-26` (użycie :133-134) — **K1**: `new BuildTimeAstroVersionProvider()`, `piccoloreTextStyler`
- `core/preview/static-preview-server.ts:12-13` (użycie :99-100) — **K1**
- `vite-plugin-app/createAstroServerApp.ts:9-12` (użycie :33-42) — **K1**; `:4-8` — facet `cli/info/*`
- `cli/infra/build-time-astro-version-provider.ts:1` — type-import portu (sprzężenie K1→K2); najbardziej przeciekający plik
- `test/units/cli/index.test.ts:3,52`, `test/cli.test.ts:66`, `test/units/cli/misc.test.ts:4` — osłony (via `git show HEAD:`)
- `.github/workflows/ci.yml` — `typecheck`/`test:types`/`test:unit`/`e2e`; **brak reguły granic warstw**
- `CONTRIBUTING.md:394-402` — opis warstw deskryptywny, nie preskryptywny (brak ograniczenia `core→cli`)

## Architecture Insights

- **[I]** Smell to jeden mechanizm w dwóch (właściwie trzech) facetach: `cli/` był pierwszym właścicielem portów i adapterów I/O; `core/` i `vite-plugin-app` reużyły je w miejscu, tworząc odwróconą zależność. Seam port/adapter *już istnieje* — brakuje wyłącznie **neutralnej lokalizacji** kontraktu i adapterów.
- **[E/I]** Twardy porządek migracji wynika z faktu, że adaptery importują swój port: **typ musi wyjść z `cli/` przed klasą** (K2 przed K1), inaczej naprawa jest połowiczna.
- **[E]** Największe ryzyko trwałości: **brak enforcementu granic** w CI. Bez reguły `no-restricted-imports`/dependency-cruiser każda przyszła krawędź `core→cli` przejdzie na zielono.

## Historical Context (from prior changes)

- `context/changes/large-scale-and-legacy-code/cli-infra-data-flow/research.md` — **primary evidence** tej zmiany; 8 problemów (§A przecieki, §B luki testowe, §C blast radius). Werdykt „layer leak POTWIERDZONY", weryfikacja ast-grep+grep (C1–C9).
- `context/map/repo-map.md` — prior tamtej analizy; §3/§4 wskazują `cli/infra/*` jako przeciek i bus factor ≈ 1; §1 zawyżyło „~14 importów" (realne 8). Szersze strefy (render, config) świadomie poza zakresem tego raportu.
- `context/foundation/lessons.md` — dotyczy wyłącznie 10xCards; brak priora do reużycia dla analizy `astro`. (Reguła „zero z ast-grep może być artefaktem wzorca" z tamtej analizy — zastosowana już w raporcie źródłowym, C9.)

## Related Research

- `context/changes/large-scale-and-legacy-code/cli-infra-data-flow/research.md` (jedyny inny artefakt research tej grupy).

## Open Questions

- **[U]** Głębszy motyw utrzymania portów w `cli/` (świadoma decyzja vs skostniałe reuse) — w wątkach PR #14306 / #15639 na GitHub, poza gitem.
- **[U]** Facet `cli/info/*` → `vite-plugin-app`: własny plik portów (`cli/info/definitions.ts`?) i pełny blast radius niezbadane — do dociągnięcia przed planem transzy #2.
- **[U]** Cross-package: czy `cli/infra`/`cli/info` są konsumowane spoza `packages/astro` (np. `@astrojs/*`) — graf nie obejmuje innych pakietów.
- **[U]** Runtime call-paths: kiedy dev/preview faktycznie wołają wstrzyknięte adaptery w cyklu życia serwera (analiza to sprzężenie import-time + commit-time, nie runtime).
