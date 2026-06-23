---
date: 2026-06-23T16:14:44+0200
researcher: karczynski_t
git_commit: b41e8f0fc914262143c031867d2b80a5bc863847
branch: main
repository: 10xDEVS
topic: "Persistence & data integrity (Risks #2 + #6) — DB-touching integration tests against the cloud test project"
tags: [research, codebase, testing, vitest, supabase, rls, srs, ts-fsrs, risk-2, risk-6, phase-2]
status: complete
last_updated: 2026-06-23
last_updated_by: karczynski_t
---

# Research: Persistence & data integrity (Risks #2 + #6)

**Date**: 2026-06-23T16:14:44+0200
**Researcher**: karczynski_t
**Git Commit**: b41e8f0fc914262143c031867d2b80a5bc863847
**Branch**: main
**Repository**: 10xDEVS

## Research Question

Rollout Phase 2 of `context/foundation/test-plan.md` ("Persistence & data
integrity"), covering **Risk #2** (card create/edit survives reload — no silent
data loss) and **Risk #6** (SRS grades persist and schedule). Establish: the
oracle for each risk (from PRD, not from the handlers); the exact create / edit /
grade / due contracts; and — the central unknown — **how a Vitest integration
test obtains a real, RLS-authenticated Supabase client against the cloud test
project**, given prod code reads config from `astro:env/server`, which the
Phase-1 plain `vitest/config` cannot resolve, and these tests cannot mock the DB
seam (real read-back is the whole point).

## Summary

The Phase-1 mocking trick (`vi.mock("@/lib/ai")` so `astro:env` never loads)
does **not** transfer: Risk #2/#6 require real persistence, so the DB seam must
be real. The single architectural fact that drives the whole design is that the
handlers **split authz from data access**: `context.locals.user` is used only for
the 401 gate, while every RLS-scoped DB call goes through a cookie-bound client
(`createClient(request.headers, cookies)` + `await supabase.auth.getSession()`).
The RLS identity (`auth.uid()`) comes entirely from the JWT in the `Cookie`
header — **not** from `locals.user`. So a fake `APIContext` with only
`locals.user` (the Phase-1 pattern) is insufficient: with no auth cookie,
`auth.uid()` is null and every RLS write is rejected (insert→500, update/grade→
404). This is exactly the `getSession()` hydration lesson
(`lessons.md:28-33`).

**Recommended wiring (for the plan to ratify):**

1. **`astro:env/server` alias shim** in `vitest.config.ts` → a tiny
   `tests/shims/` module re-exporting from `process.env`, so the **real**
   `src/lib/supabase.ts` runs unchanged (cookie → `getSession()` → JWT → RLS end
   to end). This is the only option that exercises the seam Risk #2 cares about.
2. **Authenticated session per test** via `signInWithPassword` (Confirm-email is
   off) → attach the resulting `sb-<ref>-auth-token` cookie to the request the
   handler reads; `<ref>` = `kqbppawdvnjuxpvrshee`.
3. **Read-back / setup / teardown via an independent service-role client**
   (built like `createAdminClient`) — a privileged reader that RLS can't fool,
   plus one-call cascade cleanup (`auth.admin.deleteUser` → FK `ON DELETE
   CASCADE` removes the user's flashcards).
4. **Unique user per test** (`test+<timestamp><rand>@example.com`) for
   parallel-safe isolation; **dep-free `.env.test` load** in a DB-only setup
   file.

Both oracles assert **observable persistence, never library internals**: Risk #2
= write then re-read returns the sent values (reload survival); Risk #6 = a
graded card gets a **future** `srs_due`, `srs_reps` increments, and **"again"
reschedules sooner than "good"** — never assert exact ts-fsrs intervals/floats.

## Detailed Findings

### A. The wiring problem and the recommended solution

- **Constraint:** `src/lib/supabase.ts:4` imports `SUPABASE_URL`,
  `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from `astro:env/server`. That
  virtual module is unresolvable under the plain `vitest/config`
  (`vitest.config.ts:1-26`; the `getViteConfig` route is deliberately rejected,
  `vitest.config.ts:5-12` and test-plan §6.6 at `test-plan.md:207`).
- **Handlers split authz from data access** — the load-bearing detail:
  `context.locals.user` is read only for the 401 gate
  (`flashcards/index.ts:20-23`, `[id].ts:15-18`, `[id]/review.ts:20-23`); the
  RLS-scoped queries run through `createClient(request.headers, cookies)` +
  `await supabase.auth.getSession()` (`index.ts:38-46`, `[id].ts:37-45,79-86`,
  `[id]/review.ts:42-49`). `getSession()` decodes the JWT from the `Cookie`
  header locally and attaches it to PostgREST calls → that JWT is what makes
  `auth.uid()` non-null so the `TO authenticated` policies pass.

**Recommended: option (b) `astro:env/server` alias shim** (primary) **+ option
(c) standalone service-role client** (read-back/teardown):

- (b) Add to `vitest.config.ts` `resolve.alias` an entry mapping
  `"astro:env/server"` → a real file under `tests/shims/` that re-exports
  `process.env.SUPABASE_URL` / `_KEY` / `_SERVICE_ROLE_KEY` (and
  `OPENROUTER_API_KEY`, so any graph pulling `@/lib/ai` at `src/lib/ai.ts:4`
  still resolves). Alias target resolved with `fileURLToPath(new URL(...))` just
  like the existing `@` alias (`vitest.config.ts:15-18`). With this, the **real**
  `src/lib/supabase.ts` runs unchanged — the cookie→`getSession()`→JWT→RLS path
  executes as in prod. Caveat: the alias is global, so it also applies to Phase-1
  tests — harmless (they mock `@/lib/ai` anyway).
- (c) A direct `createSupabaseClient(url, serviceKey)` (bypasses RLS) is the
  right tool for **read-back assertions** and **teardown** only — never to stand
  in for the user path under test. Handler-via-(b) + readback-via-(c) gives the
  most faithful signal: the handler runs through real RLS; the assertion reads
  through a privileged client that RLS can't fool.

**Rejected: option (a) `vi.mock("@/lib/supabase")` returning real clients.** To
satisfy RLS you'd re-implement the cookie-reading `createServerClient` config
that is the very code under validation (`supabase.ts:10-24`), losing the
session-hydration seam Risk #2/#4 care about and drifting from prod. Keep only as
a last resort if (b) proves unworkable.

### B. Authenticated client for RLS (the test recipe)

Confirm-email is off in the test project, so sign-in returns a live session
immediately.

- **Step 0 — real session per test user:**
  `const anon = createSupabaseClient(URL, ANON_KEY); const { data } = await
  anon.auth.signInWithPassword({ email, password }); const { access_token,
  refresh_token } = data.session!;`
- **Path (ii) — synthesize the Cookie header (preferred; exercises the real
  handler).** `supabase.ts:12-17` reads cookies via
  `parseCookieHeader(requestHeaders.get("Cookie"))`. Default cookie name
  (Context7 `/supabase/supabase`, server-side client guide) is
  **`sb-<project_ref>-auth-token`** (`<ref>` = `kqbppawdvnjuxpvrshee`), value a
  `base64-`-prefixed JSON session, chunked into `.0`/`.1` when large. No custom
  `cookieName` is set anywhere in `src` (grep found none) → default format
  applies. Build the fake `APIContext` so `request.headers.get("Cookie")`
  returns that cookie and set `locals.user` to the signed-in user (to pass the
  401 gate). Also pass a working `AstroCookies` as `context.cookies` so the
  client's `setAll` (token refresh) doesn't throw.
- **Path (i) — authenticated standalone client (simplest; for RLS-as-user
  assertions without the handler).** Either
  `await userClient.auth.setSession({ access_token, refresh_token })` then
  `userClient.from("flashcards")…`, or
  `createSupabaseClient(URL, ANON_KEY, { global: { headers: { Authorization:
  ` + "`Bearer ${access_token}`" + ` } } })`. Ideal for the Phase-3 two-user IDOR
  test; for Phase 2 it's a convenient way to do the read-back as the owning user.

Prod reference points: sign-in is `signInWithPassword` in
`src/pages/api/auth/signin.ts:13` (reads **formData**, not JSON); the `setAll`
callback in `supabase.ts:18-22` writes `sb-...-auth-token`; middleware reads it
back via `createClient` + **`getUser()`** (validated round-trip) at
`middleware.ts:7-13`, whereas handlers use the cheaper `getSession()`.

### C. Env loading in Vitest

- **No `dotenv` dependency** (confirmed — not in `package.json` deps/devDeps).
- Vitest/Vite `loadEnv` only auto-exposes `VITE_`-prefixed vars; these keys are
  unprefixed, so that path won't populate `process.env` without widening
  `envPrefix` (don't).
- **Recommended (dep-free):** a DB-only setup file (e.g. `tests/setup.db.ts`)
  that parses the 3-line `.env.test` (shape shown in `.env.test.example`) into
  `process.env`, wired via a separate `setupFiles` entry or a separate Vitest
  project so Phase-1 jsdom tests don't load real keys. Upgrade to `dotenv`
  (`dotenv.config({ path: ".env.test" })`) only if quoting/multiline parsing
  becomes annoying. Do **not** put secret values in `test.env` in the config.
- `.env.test` is correctly git-ignored (`.gitignore` `.env*` with only
  `!.env.example` / `!.env.test.example` exemptions — verified).

### D. Test isolation & cleanup on the shared cloud DB

- **Unique user per test:** `test+<timestamp><rand>@example.com` so parallel
  runs / re-runs never collide (matches CLAUDE.md /10x-e2e unique-id rule).
- **Create pre-confirmed users via service-role admin**
  (`admin.auth.admin.createUser({ email, password, email_confirm: true })`) —
  more robust than relying on the project's confirm-email toggle and avoids
  signup-flow coupling.
- **Teardown via cascade:** `admin.auth.admin.deleteUser(userId)` (the exact
  call prod uses, `src/pages/api/account/delete.ts:19`); FK `ON DELETE CASCADE`
  (`migrations/20260528000000_create_flashcards.sql:5`) removes the user's
  flashcards in one call. Do it in `afterEach`/`afterAll`.
- **Service-role client** built like `createAdminClient`
  (`supabase.ts:30-37`): `createSupabaseClient(URL, SERVICE_ROLE_KEY, { auth: {
  autoRefreshToken: false, persistSession: false } })` — setup/teardown/read-back
  only.
- **Parallel safety:** every fixture is namespaced to a unique user and cleanup
  deletes that user → Vitest default parallelism is safe; no shared global rows.

### E. Risk #2 — create / edit persistence contracts

> **No `src/lib/services/` exists.** Handlers are self-contained; there is no
> service layer to mock — which is exactly why test-plan §2 warns against
> "over-mocking Supabase so the test only mirrors the handler." There is also
> **no GET API handler** — the list/read-back path is the server-rendered page
> `src/pages/flashcards.astro:14-29` running the same `createClient → getSession
> → select("id, front, back, created_at")` sequence. For read-back, replicate
> that SELECT via the independent service-role client.

- **POST create** (`flashcards/index.ts`): `prerender=false` (5); 401 if no
  `locals.user` (20-23); **batch** body `{ cards: Array<{front,back}> }`, each
  `z.string().trim().min(1)`, array `.min(1).max(15)` (7-17); bad JSON→400
  (28-30), zod→400 (32-35); `createClient(...)` null→500 (38-41);
  `getSession()` at 46; insert rows `{ front, back, user_id: user.id }`
  (48-52) `.select("id, front, back, created_at")` (54); DB error→500 (56-60);
  returns `{ saved, cards }` (full records) 200 (62).
- **PATCH edit** (`flashcards/[id].ts`): `IdSchema=z.uuid()` (7); 401 (15-18);
  bad id→400 (20-23); body `{ front, back }` both required
  `z.string().trim().min(1)` (9-12) — **not partial** despite `FlashcardUpdate`
  being `Partial`; JSON/zod→400 (25-35); client null→500 (37-41);
  `getSession()` at 45; `.update({front,back}).eq("id", id).select("id, front,
  back, created_at")` (47-51) — **no explicit `user_id` filter; ownership via RLS
  `USING` only**; DB error→500 (53-57); **empty result→404** (RLS hides
  non-owned, so missing & foreign both 404, 61-63); returns `{ card }` 200 (65).
  `updated_at` is auto-bumped by trigger `update_flashcards_updated_at`
  (migration 20-22) and not selected/returned.
- **DELETE** (`[id].ts:68-101`): same auth/id/hydration;
  `.delete().eq("id", id).select("id")`; empty→404; `{ deleted: id }` 200.
- **Types** (`src/types.ts`): `Flashcard` (1-19) full entity incl. 9 SRS fields;
  `FlashcardInsert = Pick<…,"front"|"back">` (21);
  `FlashcardUpdate = Partial<…>` (23); collection DTO ≈
  `Pick<Flashcard,"id"|"front"|"back"|"created_at">`.

### F. Risk #6 — SRS grade persistence & scheduling contracts

- **Schema** (`migrations/20260605000000_add_srs_fields.sql`, ALTER block
  10-19) — 9 columns, all NOT NULL except `srs_last_review`; defaults mirror
  ts-fsrs `createEmptyCard()` so existing rows backfill as immediately-due New
  cards:
  `srs_due TIMESTAMPTZ default now()` (11), `srs_stability DOUBLE PRECISION 0`
  (12), `srs_difficulty DOUBLE PRECISION 0` (13), `srs_elapsed_days INTEGER 0`
  (14), `srs_scheduled_days INTEGER 0` (15), `srs_reps INTEGER 0` (16),
  `srs_lapses INTEGER 0` (17), `srs_state SMALLINT 0` **CHECK 0..3** (18),
  `srs_last_review TIMESTAMPTZ` nullable (19). Index
  `idx_flashcards_user_due (user_id, srs_due)` (22). No new RLS/GRANT (existing
  user_id-scoped policies cover the new columns).
- **POST grade** (`flashcards/[id]/review.ts`): body
  `{ rating: z.enum(["again","hard","good","easy"]) }` (10-12); 401 (20-23); id
  z.uuid→400 (25-28); JSON→400 (30-35); bad rating→400 (37-40); `getSession()`
  at 49 (before SELECT and UPDATE); SELECT `SRS_COLUMNS` (16-17) — the **8**
  round-tripped columns, **excludes `srs_elapsed_days`** (ts-fsrs recomputes);
  `.eq("id", id)`, RLS-scoped; empty→404 (61-63); compute via
  `review(row, rating, new Date())` (65); UPDATE full next state guarded by
  **`.eq("srs_reps", row.srs_reps)`** (optimistic concurrency — srs_reps is
  monotonic) `.select("id, front, back, srs_due")` (70-75); UPDATE error→500
  (77-81); **empty UPDATE→409 Conflict** (concurrent review bumped srs_reps,
  83-87); success `{ card: {id,front,back,srs_due} }` 200 (89).
- **GET due** (`flashcards/due.ts`): 401 (8-11); `getSession()` 20; `SELECT id,
  front, back WHERE srs_due <= formatDate(new Date())` (23-27) **ordered srs_due
  asc**; `{ cards }` (35); error→500.
- **ts-fsrs wrapper** (`src/lib/srs.ts`, `ts-fsrs ^5.4.1`): `scheduler = fsrs()`
  default weights (9); `RATING_MAP` again/hard/good/easy → ts-fsrs Ratings
  (12-17); `toCard` hydrates from `createEmptyCard()` + column overrides
  (24-36); schedule via `scheduler.next(toCard(row), now, RATING_MAP[rating])
  .card` (57); `fromCard` serializes back, Dates via `formatDate()` (UTC ISO),
  **`srs_elapsed_days` not written** (deprecated, removed in ts-fsrs v6;
  `types.ts:31-35`). Date↔ISO boundary is contained entirely in this module.
- **Date handling:** `formatDate` = `src/lib/utils.ts:8-10` →
  `date.toISOString()`; SRS path uses `formatDate(new Date())` (UTC rule
  satisfied). Raw `new Date().toISOString()` appears only in throwaway
  `lesson4*.ts` files, not in the SRS path.
- **Types:** `ReviewRating` (`types.ts:26`); `ReviewCard =
  Pick<Flashcard,"id"|"front"|"back">` (29); `SrsState` (36-46) = the 8
  persisted columns (excludes `srs_elapsed_days`).

### G. Oracles (assert these; from PRD/test-plan, not the handlers)

**Risk #2 (reload survival):**
- Guardrail `prd.md:52`: "Card edits must persist reliably. No silent data loss:
  if a user edits a card and saves, the change must survive a page reload."
- FR-005 manual create `prd.md:90`; FR-007 edit `prd.md:99`; US-01 acceptance
  `prd.md:67` ("accepted cards persist after page reload"); NFR isolation
  `prd.md:123`.
- → write via POST/PATCH, then **re-read from the DB** and assert persisted
  values equal what was sent. test-plan §2 Risk #2: challenge "200 therefore
  persisted"; cheapest layer = integration POST/PATCH + read-back on the cloud
  test project.

**Risk #6 (schedule):**
- FR-009 `prd.md:108` (review session), FR-010 `prd.md:112` ("ready-made spaced
  repetition algorithm to schedule future reviews"), constraint `prd.md:145`
  ("No custom SRS algorithm — established library"); engine note `prd.md:133`.
- test-plan oracle row #6 (`test-plan.md:63`): *"A graded card gets a persisted
  future due-date; 'again' reschedules sooner than 'good'."* Anti-pattern:
  "Copying ts-fsrs internal numbers into assertions (tests the library, not our
  integration)."
- **Deterministic, safe to assert:** `srs_reps`+1; `srs_last_review` non-null ≈
  review time; `srs_due` in the **future** for good/easy/hard; **"again" `srs_due`
  earlier than "good"** on an equivalent card; `srs_state` ∈ {0..3} and advances;
  `srs_lapses` increases on "again" of a Review card; all 8 `SrsState` columns
  survive read-back (`srs_elapsed_days` stays at default); endpoint statuses
  (200/400/401/404/409/500); a `srs_due<=now` card appears in GET /due and
  disappears after "good"; /due ordered srs_due asc.
- **Do NOT assert:** exact intervals / `srs_due` offsets (FSRS fuzz), exact
  `srs_stability`/`srs_difficulty` floats — at most assert direction/sign.

## Code References

- `src/lib/supabase.ts:4` — config from `astro:env/server` (the wiring
  constraint); `:6-25` `createClient`; `:30-37` `createAdminClient`.
- `vitest.config.ts:1-26` — plain `vitest/config`; `:5-12` why not
  `getViteConfig`; `:15-18` `@` alias pattern (template for the env shim alias).
- `src/middleware.ts:4` PROTECTED_ROUTES; `:7-13` `getUser()` + `locals.user`.
- `src/pages/api/auth/signin.ts:13` — `signInWithPassword` (formData).
- `src/pages/api/flashcards/index.ts:7-17,20-23,38-62` — POST create.
- `src/pages/api/flashcards/[id].ts:7-12,15-18,37-65,68-101` — PATCH/DELETE.
- `src/pages/api/flashcards/[id]/review.ts:10-12,16-17,42-49,53,65,70-89` —
  grade.
- `src/pages/api/flashcards/due.ts:8-11,20-27,35` — due query.
- `src/lib/srs.ts:9,12-17,24-36,39-50,57` — ts-fsrs wrapper.
- `src/lib/utils.ts:8-10` — `formatDate`.
- `src/pages/flashcards.astro:14-29` — server-rendered read path (read-back
  reference).
- `src/pages/api/account/delete.ts:12-19` — service-role + cascade teardown
  reference.
- `supabase/migrations/20260528000000_create_flashcards.sql:5,25-46` — FK
  cascade + RLS policies; `…20260601000000_grant…:1` — GRANT;
  `…20260605000000_add_srs_fields.sql:10-22` — SRS columns + index + CHECK.
- `tests/pages/api/flashcards/generate.test.ts:9-13,33-45` — existing
  direct-handler invoke pattern (Phase 2 extends with cookie + read-back; does
  NOT mock `@/lib/supabase`).
- `prd.md:52,67,90,99,108,112,123,133,145` — oracle sources.
- `context/foundation/test-plan.md:63` (oracle), §6.2/§6.4/§6.6 cookbook.

## Architecture Insights

- **Authz ≠ data access.** `locals.user` gates; the cookie-derived JWT (via
  `getSession()`) authorizes the DB query. Tests must supply the cookie, not
  just `locals.user`. This is the crux of the Phase-2 harness.
- **All ownership/isolation is RLS-based** (`auth.uid() = user_id`), with
  explicit `user_id` set only on insert. Edit/delete/grade rely on RLS `USING`;
  a non-owned/missing row uniformly surfaces as **404** (no explicit filter).
  This makes the Phase-3 IDOR test trivially expressible on the same harness.
- **The grade UPDATE is optimistically concurrent** (`.eq("srs_reps", prev)` →
  409 on lost race) — a real, testable contract beyond the schedule math.
- **No service layer + no GET API** → the read-back must go through the page's
  SELECT or an independent service-role client; you cannot test persistence by
  mocking a seam (there is none), which aligns with test-plan §2's anti-mock
  guidance.
- **Oracle discipline:** both risks assert observable persistence/relative
  ordering, never ts-fsrs internals — the test-plan explicitly flags copying
  library numbers as the anti-pattern.

## Historical Context (from prior changes)

- `context/changes/testing-ai-generation-robustness/plan.md` &
  `…/research.md` — Phase 1: established the **plain `vitest/config`** (not
  `getViteConfig`, the cloudflare adapter aborts startup), top-level `tests/`
  mirroring `src/`, and the direct-handler-invoke pattern Phase 2 extends. Phase
  1 was DB-free by mocking `@/lib/ai`; Phase 2 cannot reuse that escape.
- `context/foundation/lessons.md:14-19` (GRANT), `:28-33` (`getSession()`
  hydration — the exact reason `locals.user` alone fails RLS), `:35-40`
  (mutating endpoints return full record — matches POST/PATCH `.select`),
  `:42-47` (`astro sync` before lint after env.schema change).
- `context/archive/2026-06-01-ai-generation-flow/` — generate-flow history (Risk
  #1, prior phase).

## Related Research

- `context/changes/testing-ai-generation-robustness/research.md` — Phase 1
  oracle + stack decisions (Vitest, MSW deferred).
- `context/foundation/test-plan.md` §2 (Risks #2/#6), §3 Phase 2, §4 (cloud test
  project), §6.2/§6.4/§6.6 (cookbook to extend), §7 (don't assert exact
  content).

## Open Questions (decide in /10x-plan)

1. **Wiring: env-shim (b) vs mock-`@/lib/supabase` (a).** Recommendation: **(b)
   `astro:env/server` alias shim** — only it exercises the real
   cookie→`getSession()`→RLS seam. (a) re-implements the code under test.
2. **Authenticated handler invocation: synthesize the `sb-<ref>-auth-token`
   cookie (Path ii) vs assert via an authenticated standalone client (Path i).**
   Recommendation: drive the **handler with a synthesized cookie** for the
   create/edit/grade actions (faithful to prod), and use the **service-role
   client for read-back**. Path (i) is a fallback if cookie formatting (base64 +
   chunking) proves fiddly — and is the natural fit for Phase 3.
3. **Env loading: dep-free `.env.test` parse vs add `dotenv`.** Recommendation:
   **dep-free** in a DB-only setup file; upgrade only if needed.
4. **Single Vitest config with a DB project vs a separate config for DB tests.**
   Decide how to keep Phase-1 jsdom tests from loading real keys / hitting the
   network (e.g. a separate `setupFiles` entry or Vitest `projects`). Lean: one
   config, a DB-only setup file gated to `tests/integration/**`.
5. **Scope of #6 assertions:** lock the "again < good" ordering + future-due +
   reps-increment + read-back as the core; treat the 409 concurrency guard and
   /due appearance/disappearance as in-scope but secondary. Confirm in plan.
6. Ignore the experimental `src/pages/api/lesson4*.ts` scratch endpoints and the
   stray `test-results.txt` — not fixtures, not under test.
