# Artefakt 1 — Terytorium (withastro/astro)

**Repo:** https://github.com/withastro/astro (blobless clone)
**Metoda:** wyłącznie historia gita (`git log --name-only --no-merges`), bez czytania kodu.
**Okno:** ostatnie 12 miesięcy — `--since=2025-06-28` (HEAD: 2026-06-26).
**Zbiór:** 1 984 commity (no-merges), 24 040 zmian plików → **20 315 po odfiltrowaniu szumu**.
**Cel:** gdzie projekt realnie żyje i które obszary są wrażliwe przed większą zmianą.

> Monorepo (pnpm). Środek ciężkości to **`packages/astro`** — ~50% całej aktywności (10 060 / 20 315). Reszta to integracje, narzędzia językowe i `astro db`.

---

## a) TOP obszary (foldery / moduły)

Zgrubny podział był bezużyteczny (`packages/astro` pochłaniał wszystko), więc zszedłem niżej.

**Poziom pakietów:**

| # | Obszar | Zmiany | Co to |
|---|--------|-------:|-------|
| 1 | `packages/astro` | 10 060 | rdzeń frameworka |
| 2 | `packages/integrations/*` | 3 603 | adaptery i integracje |
| 3 | `packages/language-tools` | 625 | language server (DX edytora) |
| 4 | `packages/db` | 426 | `@astrojs/db` |

**Wewnątrz `packages/astro` (gdzie naprawdę kipi):**

| # | Obszar | Zmiany | Uwaga |
|---|--------|-------:|-------|
| 1 | `src/core/**` | 1 245 | serce: build, app, routing, config, errors |
| 2 | `src/assets/**` | 639 | zdominowane przez `fonts` (378) — świeży, gorący feature |
| 3 | `src/cli/**` | 231 | m.in. `astro add` |
| 4 | `src/types/**` | 187 | publiczny kontrakt typów (`public/config.ts`) |
| 5 | `src/content/**` | 161 | content collections |
| 6 | `src/runtime/**` | 155 | runtime serwera/klienta |
| 7 | `src/vite-plugin-astro-server` | 90 | dev server |

**Najgorętsze podobszary `src/core`:** `build` (255), `app` (190), `routing` (101), `config` (101), `errors` (92), `dev` (41), `middleware` (36), `fetch` (36).

**Integracje (TOP):** `cloudflare` (767) ≫ `mdx` (330), `node` (243), `markdoc` (231), `netlify` (152), `vercel` (144), `svelte` (137), `sitemap` (136).
→ **Cloudflare to najaktywniejsza integracja** — istotne dla nas, bo sami deployujemy na Cloudflare Workers.

---

## b) TOP pliki (realny hands-on kod)

Po odcięciu bumpów wersji (`examples/*/package.json`, `package.json`, `tsconfig`, README):

| # | Plik | Zmiany | Dlaczego ważny |
|---|------|-------:|----------------|
| 1 | `src/types/public/config.ts` | 89 | **publiczny kontrakt** konfiguracji — dotyka każdego usera |
| 2 | `integrations/cloudflare/src/index.ts` | 73 | wejście adaptera Cloudflare |
| 3 | `src/core/config/schemas/base.ts` | 58 | walidacja configu (zod) |
| 4 | `src/core/errors/errors-data.ts` | 48 | katalog błędów frameworka |
| 5 | ~~`src/core/render-context.ts`~~ | 41 | ⚠️ **USUNIĘTY 2026-05-06** (#16366) — patrz „Walidacja" |
| 6 | `src/assets/fonts/vite-plugin-fonts.ts` | 38 | nowy system fontów |
| 7 | `src/vite-plugin-astro-server/plugin.ts` | 37 | dev server (HMR) |
| 8 | `src/assets/vite-plugin-assets.ts` | 37 | pipeline assetów |
| 9 | `src/core/build/static-build.ts` | 33 | build statyczny |
| 10 | `src/core/build/generate.ts` | 32 | generacja stron przy buildzie |
| — | `src/core/app/base.ts` | 32 | wejście aplikacji SSR |
| — | `src/cli/add/index.ts` | 31 | `astro add` |

Poza pakietem: `.github/workflows/ci.yml` (36), `knip.js` (29), `.github/workflows/release.yml` (31) — żywe tooling/CI.

---

## Co zmienia się razem (co-changes)

Pary obszarów najczęściej w jednym commicie:

- **`core/*` + testy — 238** (najsilniejsza para). Każda zmiana rdzenia ciągnie testy.
- **testy + `src/other` (138), + `vite-plugins` (103), + `assets` (66), + `config` (61)** — kultura testów jest wszechobecna; brak testu w PR-ze rdzenia to anomalia.
- **`examples` + integracje (134), `cloudflare` + inne integracje (131), `examples` + `cloudflare` (79)** — dodanie/zmiana integracji idzie w parze z jej przykładem.
- **`core/build` + `src/other` (61), + `core/*` (60)** — build jest przekrojowy, dotyka wielu warstw naraz.

### Sprzężenia feature↔feature (po odjęciu wszechobecnego `test`)

Pary bez testu (realna struktura, nie dyscyplina testowa):

| Para | Wspólne commity | Sygnał |
|------|----------------:|--------|
| `core/other` + `types` | 74 | zmiana rdzenia ciągnie **publiczny kontrakt typów** |
| `core/other` + `src/other` | 74 | rdzeń przeplata się z resztą `src` |
| `core/other` + `vite-plugins` | 70 | rdzeń sprzężony z warstwą Vite |
| `core/other` + `int:other` | 63 | zmiany rdzenia **przeciekają do integracji** |
| `core/build` + `core/other` | 59 | build nierozłączny z resztą rdzenia |
| `src/other` + `types` | 52 | typy jako wspólny kontrakt |

Trójki (bez testu): `core/build + core/other + src/other` (44), `core/config + core/other + types` (40), `core/build + core/other + vite-plugins` (37).

### Wnioski dla TOP 3 z rankingu

1. **`src/core` (#1, 1245)** — **hub grafu zmian, najwyższy blast radius.** Sprzęga się szeroko: `types` (74, publiczne API), `src/other` (74), `vite-plugins` (70), a nawet `int:other` (63). Trójki potwierdzają: rdzeń + build + reszta `src`. *Praktycznie:* dotknięcie core ≈ dotknięcie `types` + testów + zwykle jakiegoś vite-plugina. Refaktor w izolacji jest tu iluzją.
2. **`src/assets` / fonts (#2, 639)** — silne sprzężenie tylko z **testami** (103), znikome z innymi feature'ami (`assets + core/other + test` ledwie 37). **Feature samowystarczalny** z mocną dyscypliną testów — można nad nim pracować w izolacji, ale test napiszesz zawsze. Niski blast radius.
3. **`src/cli` (#3, 231)** — **najbardziej izolowany** z całej trójki: nie pojawia się w żadnej z TOP par/trójek (poza odfiltrowanymi bumpami). Zmiany zostają lokalne → najbezpieczniejszy do tknięcia bez efektów ubocznych. Uwaga: po zrywie w 25Q4 obszar przycichł (patrz kwartały).

> Zasada wejścia: **core = ostrożnie i szeroko** (typy + integracje + testy), **assets/cli = lokalnie** (przede wszystkim własne testy).

---

## Ewolucja nacisku — kwartalnie

Te same dane pocięte na kwartały kalendarzowe (zmiany plików wg obszaru; szum odfiltrowany).
**Tempo pracy ~potroiło się** w 2026 — commity/kwartał: 267 → 358 → 714 → 645 (26Q2 niepełny, do 26 czerwca).

| Obszar | 25Q3 | 25Q4 | 26Q1 | 26Q2 | Trend |
|--------|-----:|-----:|-----:|-----:|-------|
| **core:test** | 365 | 371 | 1109 | **2857** | 🚀 eksplozja testów |
| integracje (inne) | 218 | 142 | 466 | 744 | ↗ stały wzrost |
| core/other | 61 | 178 | 255 | 296 | ↗ rośnie |
| int:cloudflare | 37 | 192 | 281 | 261 | ⤴ skok w 25Q4, potem plateau |
| core:e2e | 32 | 113 | 74 | **271** | 🚀 napór e2e w 26Q2 |
| language-tools | 0 | **261** | 55 | 99 | 💥 jednorazowy zryw 25Q4 |
| assets/fonts | 19 | 117 | 226 | **23** | 🔺▽ feature zbudowany, potem wygaszony |
| db | 57 | 26 | 36 | **210** | ⤴ odżył w 26Q2 |
| cli | 12 | **141** | 28 | 50 | 💥 zryw 25Q4 |
| actions | 1 | **44** | 7 | 7 | 💥 zbudowane w 25Q4, domknięte |
| runtime | 6 | 9 | 80 | 60 | ↗ ruszył w 2026 |
| core/build · config · routing | ~13/11/6 | ~77/24/16 | ~91/27/42 | ~74/39/37 | ≈ stabilne |

**Narracja roku — przesunięcie z „budowania" na „hartowanie":**

- **H2 2025 (25Q3–Q4) = faza feature'ów (wszerz).** Zrywy w `fonts`, `cli`, `actions`, `language-tools` i adapterze `cloudflare`. Dużo nowych obszarów naraz; testy umiarkowane (~365–371).
- **2026 (Q1–Q2) = faza jakości/konsolidacji.** `core:test` rośnie 1109 → **2857**, e2e skacze do 271 — energia przesunięta na testowanie i utwardzanie. `assets/fonts` opada (117/226 → 23) — klasyczny cykl „zbudowane → ustabilizowane". `db` i `runtime` odżywają.
- **`cloudflare`** wszedł mocno w 25Q4 i utrzymuje wysokie tempo — dojrzewająca, ale wciąż żywa integracja.

> Sygnał dla mapy: dziś środek ciężkości to **testy + integracje + db**, a nie nowe feature'y rdzenia. Wchodząc w ten kod w 2026, najpierw trafisz na rozbudowaną warstwę testów.

---

## Przecięcia z obszarami wrażliwymi (liczba zmian w 12 mies.)

| Obszar wrażliwy | Aktywność | Komentarz |
|-----------------|----------:|-----------|
| build pipeline | 299 | wysoka — duży blast radius |
| config (typy + schema) | 275 | publiczny kontrakt, łatwo o breaking change |
| render / SSR | 204 | runtime krytyczny |
| content collections | 180 | publiczne API dla userów |
| runtime/server | 151 | krytyczny |
| errors | 97 | zmiany komunikatów = DX |
| actions | 62 | nowszy obszar |
| middleware | 47 | przecina request lifecycle |

**`auth/session/cookie` w rdzeniu ≈ 0 przez większość okna** — Astro core długo nie miało warstwy sesji. **Korekta:** od 2026-05-06 (#16366) istnieje `src/core/session/handler.ts` — sesje weszły do rdzenia bardzo niedawno (patrz „Walidacja").

---

## ⚠️ Uważaj przed większą zmianą

- **`src/types/public/config.ts` i `core/config/schemas/base.ts`** — publiczny kontrakt; zmiana = potencjalny breaking change dla wszystkich userów. Najczęściej dotykane, więc też najwrażliwsze.
- **`src/core/build/**`** — przekrojowy, współzmienia się z wieloma warstwami; trudny do izolowanego refactoru.
- **`src/assets/fonts/**`** (378 zmian/rok) — feature w trakcie intensywnej stabilizacji; spodziewaj się ruchomego API.
- **`integrations/cloudflare`** — najgorętsza integracja; zmiany w rdzeniu SSR (`app/base.ts`, `render-context.ts`) potrafią ją zahaczyć.
- Każda zmiana rdzenia **bez** towarzyszącego testu łamie ustaloną normę repo (co-change 238).

---

## Wspólny mianownik — pliki spinające całe repo

Pytanie: czy poza folderami jest pojedynczy plik współzmieniający się ze wszystkim?
Metryka „liczba różnych obszarów" **nasyca się** (jest 19 bucketów; plik zmieniany 80+ razy trafia raz na każdy), więc liczyłem obszary, z którymi plik współzmienia się **≥5 razy**.

**Mianownik dosłowny = pliki release/generowane** (potwierdza Twoją intuicję o „config/generowane"):
- `pnpm-lock.yaml` (599 zmian, wszystkie 19 obszarów), `packages/astro/package.json` (258), `pnpm-workspace.yaml` (60), `CHANGELOG.md`, każdy `examples/*/package.json`.
- Zmieniają się przy każdym release/bumpie zależności → spinają wszystko, ale **niosą zero sygnału projektowego**. To je filtrujemy.

**Mianownik realny (kod) = `packages/astro/src/types/public/config.ts`** — publiczny typ konfiguracji. Współzmienia się z **wszystkimi 19 obszarami (≥5 commitów każdy)**, 89 zmian. Powód: każdy feature dokładający opcję konfiguracji dotyka tego pliku. To prawdziwy hub-kontrakt repo.
- Bliscy kuzyni: `core/config/schemas/base.ts` (zod-owy bliźniak), `core/create-vite.ts` (29), `content/utils.ts` (24), `core/build/generate.ts` (32).

> Wniosek: jedyny realny „wspólny mianownik" w kodzie to **warstwa kontraktu config/typy**. Zmiana tam = dotykasz całego repo. Trzymaj ją na liście „uważaj".

## Walidacja współzmian — czy pliki nadal istnieją w HEAD

Sprawdzone (`git cat-file -e HEAD:<path>`), bo to historia — coś mogło zniknąć:

- **11 z 12** najmocniej sprzężonych plików **istnieje** w HEAD. ✅
- **1 zniknął:** ~~`src/core/render-context.ts`~~ — **usunięty 2026-05-06** w #16366 „Advanced Routing - Experimental" (Matthew Phillips, Cloudflare). Nie rename — realna dekompozycja.
  - **Następca:** monolit render-context rozbity na architekturę handlerów: `core/routing/handler.ts`, `core/pages/handler.ts`, `core/app/prepare-response.ts`, `core/app/render-options.ts`, `core/errors/handler.ts`, `core/fetch/*`, `core/session/handler.ts`, `core/middleware/astro-middleware.ts`, dodano też `core/hono/`.
  - **Znaczenie:** to świeży, duży zwrot architektoniczny (tłumaczy skok `runtime`/`routing` i eksplozję testów w 26Q1–Q2). **Każda analiza oparta na `render-context.ts` jest nieaktualna** — wchodząc w render/SSR, zacznij od `core/*/handler.ts`, nie od nieistniejącego pliku.

## Unknowns (do potwierdzenia w krokach 2–3)

- Czy `src/core/build` to faktyczne lokalne centrum grafu zależności, czy tylko „dużo plików" — rozstrzygnie **artefakt 2 (struktura)**.
- Czy `assets/fonts` jest realnie sprzęgnięty z rdzeniem, czy to izolowany vite-plugin — graf zależności.
- Kto stoi za najgorętszymi obszarami (`config`, `cloudflare`, `fonts`) — **artefakt 3 (kontrybutorzy)**.
- Gdzie żyje auth/sesje, skoro nie w core (integracje? userland? `@astrojs/db`?).
- Ile z 258 zmian `packages/astro/package.json` to realne zmiany zależności vs bumpy wersji (nie da się rozdzielić bez treści diffów — blobless clone).

---

## Odfiltrowany szum (jawnie, dla powtarzalności)

Wykluczone z liczenia:
- `.changeset/**` — 2 190 (jeden plik na PR, narzędzie releasowe)
- `**/CHANGELOG.md` — 851 (generowane)
- `pnpm-lock.yaml` — 599 (lockfile)
- `*.snap` — 25 (snapshoty)
- `**/.env*`, `pnpm-workspace.yaml`
- wtórnie dla listy plików: `examples/**` i `**/package.json` (bumpy wersji), `**/tsconfig*.json`, `**/README.md`
