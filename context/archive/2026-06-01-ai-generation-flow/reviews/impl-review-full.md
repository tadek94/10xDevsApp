<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: AI Generation Flow (S-01)

- **Plan**: context/changes/ai-generation-flow/plan.md
- **Scope**: Full plan — Phases 1–3
- **Date**: 2026-06-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  3 warnings  1 observation

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Notes

Drift agent verified all 9 changed files: **all MATCH**. Cross-phase integration: all 12 checkpoints PASS. Phase 1 warnings F1–F7 resolved in commit `a84ab4b`. F8 is carried from Phase 1 F1 (SKIPPED).

**Triage outcome (commit `c3849cd`):** F8/F9/F11 fixed, F10 accepted with no action. **F8 was fixed better than the review recommended** — the review's suggestion to delete `getUser()` was incorrect and would have broken every save: the INSERT RLS policy `WITH CHECK (auth.uid() = user_id)` requires the endpoint's freshly created client to hydrate the user JWT, so without it `auth.uid()` is null and all inserts are rejected. The GRANT migration fixed a separate, GRANT-level error. The legitimate concern (an Auth-server round-trip) was instead resolved by switching `getUser()` → `getSession()`, which decodes the cookie locally with no round-trip while still hydrating the JWT; identity is already validated by middleware.

## Findings

### F8 — Redundantny getUser() w save endpoint (przeniesiony z F1)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious i narrowly scoped
- **Dimension**: Safety & Quality (Performance)
- **Location**: src/pages/api/flashcards/index.ts:44
- **Detail**: `await supabase.auth.getUser()` dodano żeby naprawić "permission denied" — ale przyczyną był brak GRANTu (naprawiony migracją). Extra round-trip do Supabase Auth ~50–200ms na każdy save.
- **Fix**: Usuń linie 43–44 z index.ts.
- **Decision**: FIX DIFFERENTLY — recommendacja review (usunięcie getUser) jest błędna: polityka INSERT to `WITH CHECK (auth.uid() = user_id)`, więc świeży klient endpointu MUSI zhydratyzować JWT, inaczej `auth.uid()` = null i każdy insert jest odrzucany. Migracja GRANT naprawiła osobny błąd (permission denied na poziomie GRANT). Realny problem (round-trip do Auth) rozwiązany przez `getUser()` → `getSession()` (lokalny odczyt cookie, bez round-tripu; tożsamość waliduje middleware). Naprawione.

### F9 — Brak trim() na front/back z AI przed zapisem

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious i narrowly scoped
- **Dimension**: Safety & Quality (Data Quality)
- **Location**: src/pages/api/flashcards/index.ts:11 + src/components/flashcards/FlashcardGenerator.tsx:79
- **Detail**: AI może zwrócić front/back z wiodącymi/końcowymi spacjami. `z.string().min(1)` bez `.trim()` — karta z `front=" "` przejdzie walidację i trafi do Supabase jako pusta. EditForm ma client-side guard ale tylko dla editowanej ścieżki.
- **Fix**: Dodaj `.trim()` do Zod schemy: `z.string().trim().min(1)`.
- **Decision**: FIXED — `z.string().trim().min(1)` na front i back.

### F11 — Brak obsługi 401 w React (wygasła sesja)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — warto się zatrzymać; prawdziwy trade-off
- **Dimension**: Safety & Quality (Reliability/UX)
- **Location**: src/components/flashcards/FlashcardGenerator.tsx:53-56,86-89
- **Detail**: Gdy sesja wygaśnie podczas generowania/zapisu, API zwraca 401. React wyświetla generyczny błąd bez wskazówki żeby się zalogować. Użytkownik traci wpisany tekst.
- **Fix A ⭐ Recommended**: `if (res.status === 401) { window.location.href = "/auth/signin"; return; }` w obu handlerach. Strength: Spójne z middleware, sesja wygasa rzadko. Tradeoff: Utrata niezapisanego tekstu. Confidence: HIGH. Blind spot: Brak.
- **Fix B**: Dedykowany komunikat z linkiem do signin. Strength: Użytkownik widzi tekst. Tradeoff: Złożony UI dla edge case. Confidence: MED.
- **Decision**: FIXED (Fix A) — `if (res.status === 401) { window.location.href = "/auth/signin"; return; }` w handleGenerate i handleSave.

### F10 — generate.astro nie odczytuje Astro.locals.user

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/pages/generate.astro
- **Detail**: dashboard.astro pobiera `const { user } = Astro.locals`. generate.astro nie — słusznie, bo nie przekazuje danych do FlashcardGenerator. Middleware gwarantuje ochronę. Brak akcji.
- **Fix**: Brak akcji.
- **Decision**: ACCEPTED — brak akcji; middleware gwarantuje ochronę trasy.
