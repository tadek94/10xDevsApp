<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: AI Generation Flow

- **Plan**: context/changes/ai-generation-flow/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-06-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  5 warnings  2 observations

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Zbędny getUser() w save endpoint

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious i narrowly scoped
- **Dimension**: Safety & Quality (Performance)
- **Location**: src/pages/api/flashcards/index.ts:43
- **Detail**: `await supabase.auth.getUser()` zostało dodane żeby naprawić "permission denied" — ale prawdziwą przyczyną był brak GRANTu (naprawiony migracją). Teraz `getUser()` dodaje zbędny round-trip do Supabase Auth na każdy save request. Klient SSR z `@supabase/ssr` odczytuje session JWT z cookie automatycznie przy każdym DB call.
- **Fix**: Usuń linie 43–44 z index.ts.
- **Decision**: SKIPPED

### F2 — Brak max length na polu text w generate endpoint

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious i narrowly scoped
- **Dimension**: Safety & Quality (Security)
- **Location**: src/pages/api/flashcards/generate.ts:7-9
- **Detail**: `GenerateSchema` waliduje tylko min(1) + word count ≥ 50, brak górnego limitu. Użytkownik może wysłać setki KB — rośnie koszt tokenów i czas CPU. Tekst trafia verbatim do promptu AI (linia 53).
- **Fix**: Zmień GenerateSchema na `z.string().min(1).max(10000)`.
- **Decision**: FIXED — a84ab4b

### F3 — catch w generate łączy błędy sieci (502) z malformed JSON (422)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious i narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/pages/api/flashcards/generate.ts:81
- **Detail**: Jeden try/catch obejmuje zarówno wywołanie AI (network error → 502/503) jak i JSON.parse (malformed output → 422). Klient nie może rozróżnić obu przypadków.
- **Fix**: Rozdziel catch — outer try/catch dla ai.chat.completions.create() → 502; inner try/catch dla JSON.parse → 422.
- **Decision**: FIXED — a84ab4b

### F4 — error.message z Supabase wyciekło w response 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious i narrowly scoped
- **Dimension**: Safety & Quality (Security)
- **Location**: src/pages/api/flashcards/index.ts:54
- **Detail**: `Response.json({ error: error.message }, { status: 500 })` zwraca verbatim wiadomość z PostgREST — może zawierać nazwy kolumn, constraint names, szczegóły schematu.
- **Fix**: Zmień na `{ error: "Failed to save flashcards" }` + `console.error(error)` server-side.
- **Decision**: FIXED — a84ab4b

### F5 — EXTRA: migracja GRANT poza zakresem planu Phase 1

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — warto się zatrzymać; prawdziwy trade-off
- **Dimension**: Scope Discipline + Data Safety
- **Location**: supabase/migrations/20260601000000_grant_flashcards_permissions.sql
- **Detail**: Migracja nie była w planie Phase 1. Ujawnia lukę w F-01: oryginalna migracja nie zawierała GRANTów. W nowych projektach Supabase brak automatic default privileges. Recurring pattern — każda nowa tabela będzie wymagała jawnego GRANT.
- **Fix A ⭐ Recommended**: Zapisz jako regułę w lessons.md. Migracja jest już w miejscu i poprawna. Strength: Zapobiega powtórzeniu w S-02/S-03. Tradeoff: Nie zmienia kodu. Confidence: HIGH. Blind spot: Brak.
- **Fix B**: Dodaj GRANT do oryginalnej migracji F-01 + reset. Strength: Jedna migracja pełna. Tradeoff: Ryzyko utraty danych w remote. Confidence: LOW.
- **Decision**: ACCEPTED-AS-RULE: Supabase Migrations — Explicit GRANTs (lessons.md — a84ab4b)

### F6 — user_id z locals bezpieczny (brak akcji)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality (Security)
- **Location**: src/pages/api/flashcards/index.ts:48
- **Detail**: `user_id: user.id` pochodzi z middleware-verified `context.locals.user`. RLS `WITH CHECK (auth.uid() = user_id)` stanowi niezależną drugą warstwę. Wzorzec poprawny.
- **Fix**: Brak akcji.
- **Decision**: SKIPPED

### F7 — SaveCardsSchema bez .max() na tablicy

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/flashcards/index.ts:7-16
- **Detail**: Generate endpoint zwraca max 15 kart, ale save endpoint przyjmuje `.min(1)` bez `.max()`. Brak górnego limitu umożliwia bulk INSERT dowolnej wielkości.
- **Fix**: Dodaj `.max(15)` do tablicy cards w SaveCardsSchema.
- **Decision**: FIXED — a84ab4b
