# OpenRouter Client — Plan Brief

> Full plan: `context/changes/openrouter-client/plan.md`

## What & Why

Stworzyć warstwę AI dla 10xCards: klient OpenRouter w `src/lib/ai.ts` + aktualizacja szablonów env. F-02 to fundament, który odblokowuje S-01 (generowanie fiszek). Cel: wykryć ewentualne problemy z kompatybilnością SDK i Cloudflare workerd zanim S-01 zbuduje na tym fundamencie.

## Starting Point

Projekt ma już `OPENROUTER_API_KEY` w schemacie env (`astro.config.mjs:18`) i flagę `nodejs_compat` w `wrangler.jsonc`. Brakuje samego SDK, pliku `src/lib/ai.ts` i szablonów env.

## Desired End State

`src/lib/ai.ts` eksportuje skonfigurowany klient OpenAI (baseURL → OpenRouter) i stałą `DEFAULT_MODEL = "google/gemini-2.0-flash-exp:free"`. Wywołanie API działa w dev runtime workerd. Oba pliki `.env.example` i `.dev.vars.example` dokumentują wymagany klucz.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| SDK | `openai` npm package | ESM-first, fetch-based — działa w workerd z nodejs_compat; prostszy setup niż Vercel AI SDK | Plan |
| Model domyślny | `google/gemini-2.0-flash-exp:free` | Darmowy na etapie dev, szybki (~1-2s), zmiana przed produkcją to 1 linia | Plan |
| Smoke test | Tymczasowa trasa API, usuwana po teście | Roadmap wymaga weryfikacji workerd kompatybilności przed S-01 | Plan |
| Null-safety | `OPENROUTER_API_KEY ?? ""` | Zgodne z wzorcem `src/lib/supabase.ts` — moduł nie rzuca wyjątkiem gdy brak klucza | Plan |

## Scope

**In scope:**
- Instalacja `openai` SDK
- `src/lib/ai.ts` z klientem i `DEFAULT_MODEL`
- Aktualizacja `.env.example`, stworzenie `.dev.vars.example`
- Smoke test realnego wywołania API w workerd

**Out of scope:**
- Streaming — deferred do S-01
- Prompt engineering — należy do S-01
- Model selection logic / fallbacks

## Architecture / Approach

Jeden moduł `src/lib/ai.ts` eksportuje singleton klienta (`ai`) i stałą modelu. Wszystkie przyszłe trasy AI importują z tego jednego miejsca. Wzorzec identyczny z `src/lib/supabase.ts`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. AI Module + Env Files | `src/lib/ai.ts` + env examples; lint + build zielone | openai SDK może nie skompilować się dla Cloudflare target |
| 2. Workerd Smoke Test | Realne wywołanie API działa w dev runtime | CJS lub crypto błąd w workerd runtime (nie w build) |

**Prerequisites:** `OPENROUTER_API_KEY` dodany do lokalnego `.dev.vars` przed fazą 2.
**Estimated effort:** ~1 sesja, 2 fazy.

## Open Risks & Assumptions

- `openai` SDK v4+ jest fetch-based i kompatybilny z workerd + nodejs_compat — założenie, weryfikowane przez build + smoke test
- Darmowy model `google/gemini-2.0-flash-exp:free` jest dostępny na OpenRouter w dniu implementacji

## Success Criteria (Summary)

- `npm run build` przechodzi bez błędów bundlera dla celu Cloudflare
- `GET /api/ai-test` zwraca krótką odpowiedź tekstową bez błędów CJS/crypto
- Trasa testowa usunięta; `src/lib/ai.ts` jest jedynym artefaktem F-02 w kodzie
