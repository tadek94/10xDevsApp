# Artefakt 3 — Kontrybutorzy (withastro/astro)

**Metoda:** historia commitów (`git log`, 12 mies., `--no-merges`). Odfiltrowane boty/automatyzacje (`Houston (Bot)`, `[ci] format`); commitów agentów (Claude/Codex/Copilot) bez autorstwa człowieka nie wykryto.
**Fokus (wybór):** `cli/infra` — przeciek warstw wykryty w artefakcie 2.

> Jedno zdanie: wiedza jest **silnie skupiona** — `Florian Lefebvre` dominuje cli/infra, errors, config i fonts; render należy do `Matthew Phillips`. Dla `cli/infra` bus factor ≈ 1.

---

## Identyfikacja obszarów (top 5 do kontaktu)

Z artefaktów 1 (terytorium) i 2 (struktura) — obszary, gdzie zmiana jest ryzykowna i warto pytać autora:

| # | Obszar | Dlaczego wymaga kontaktu | Główny ekspert |
|---|--------|---------------------------|----------------|
| 1 | **`cli/infra`** (fokus) | przeciek warstw — importowany przez `core/dev`, `core/preview`, `vite-plugin-app` | **Florian Lefebvre** |
| 2 | `runtime/server/render` | #1 skupisko cykli (49), #2 centrum grafu | Matthew Phillips |
| 3 | `core/errors` + `core/constants` | #1 centra in-degree (75/69) — blast radius | Florian Lefebvre |
| 4 | `core/config` + `types/public/config` | publiczny kontrakt, „wspólny mianownik" | Florian Lefebvre |
| 5 | `assets/fonts` | gorący feature (378 zmian/rok), orkiestrator | Florian Lefebvre |

---

## Linia wsparcia — kto pracował i o co pytać

### 🎯 Fokus: `cli/infra` (przeciek warstw)

**Kto:** `Florian Lefebvre` — **10 z 14 commitów** w `cli/infra`. Drugorzędni: Emanuele Stoppa (2), James Garbutt (1), Chris Swithinbank (1).

**Skąd się wziął obszar:** wprowadzony **2025-10-21** przez Floriana w serii świadomego refaktoru CLI do stylu DDD (warstwy `infra/` + `domain/` + wstrzykiwane `*-provider.ts`):
- `#14595 refactor(cli): help` — pierwsze pliki `cli/infra/`
- `#14722 refactor(cli): prepare info refactor`, `#14609 refactor(cli): info`
- `#14598 Replace kleur with picocolors` (Chris Swithinbank) — źródło `piccolore-text-styler.ts`
- `cli/install-package.ts` — Emanuele Stoppa

**Charakter przecieku:** `core/dev`, `core/preview`, `vite-plugin-app` sięgają do `cli/infra/*` i `cli/info/infra/*` (text-styler, wykrywanie package-managera, version/OS providers, command-executor). Wygląda na **zamierzone reużycie** wydzielonych providerów — ale fizycznie zostały pod `cli/`, stąd reguła `nothing-imports-cli` je łapie.

**O co zapytać Floriana (zanim ruszysz `cli/infra`):**
- Czy `cli/infra/*` ma być **współdzieloną warstwą infra** (kandydat na `core/infra`), czy to przeoczenie refaktoru?
- Czy cross-importy z `core/dev|preview` i `vite-plugin-app` są intencjonalne?
- Wzorzec `*-provider.ts` (DI) — czy obowiązuje w całym CLI, czy tylko w `info`?

**PR-y do przeczytania przed zmianą:** `#14595`, `#14722`, `#14609`, `#14598`.

**⚠️ Ryzyko wiedzy:** bus factor ≈ 1 (Florian). Przy jego niedostępności drugi kontakt: **Emanuele Stoppa**.

---

### Pozostałe obszary (kluczowi kontrybutorzy + tematyka)

| Obszar | Kontrybutorzy (12 mies.) | Tematyka / o co pytać |
|--------|--------------------------|------------------------|
| `runtime/server/render` | **Matthew Phillips** (15), Emanuele Stoppa (11), Florian (4) | Render pipeline + refaktor handlerów (#16366 „Advanced Routing"). Pytać Matthew: czy cykle render to zamierzona rekurencja |
| `core/errors` + `constants` | **Florian Lefebvre** (19), Matthew Phillips (12), Emanuele Stoppa (8) | Katalog błędów, fasada `errors/index`. Florian — zmiany kontraktu błędów |
| `core/config` + `types/public` | **Florian Lefebvre** (16), Emanuele Stoppa (13), Matthew Phillips (11) | Publiczny typ config + schema zod. Florian — breaking changes konfiguracji |
| `assets/fonts` | **Florian Lefebvre** (42), Emanuele Stoppa (8) | Cały system fontów (jego feature). Florian — jedyny realny ekspert |

### Profile kontrybutorów (klasyfikacja tematyczna)

- **Florian Lefebvre** — *architekt DX/CLI + fonts + config/errors*. Tematy: refaktor CLI (help/info/version/docs/create-key), `tinyclip`/`tinyexec`, `erasableSyntaxOnly`, scaffold `wrangler.jsonc` w `astro add`, system fontów, kontrakt config. **Najszerszy zasięg w repo** — pierwszy kontakt dla cli/infra, fonts, config, errors.
- **Matthew Phillips** — *render/routing/SSR*. Autor refaktoru handlerów (#16366), właściciel `runtime/server/render`. Kontakt dla renderu, routingu, pipeline żądania.
- **Emanuele Stoppa** — *maintainer-generalista*. Aktywny wszędzie (cli, render, errors, config) — dobry „drugi kontakt", gdy główny ekspert niedostępny.
- **Chris Swithinbank** (Princesseuh) — punktowo: swap `kleur`→`picocolors` (źródło text-stylera w cli/infra).

---

## Wnioski dla mapy (wejście do repo-map.md)

- **Skupienie wiedzy = ryzyko:** Florian Lefebvre to pojedynczy punkt wiedzy dla cli/infra, fonts i kontraktu config. Każda większa zmiana tam powinna przejść przez niego (review).
- **Czysty podział render ↔ reszta:** render = Matthew, narzędzia/DX/config = Florian. Mało nakładania → wiadomo, kogo pytać.
- **`cli/infra` przeciek jest najpewniej intencjonalny** (wydzielone providery), ale źle ulokowany — temat na rozmowę z Florianem przed jakimkolwiek refaktorem warstwy.
