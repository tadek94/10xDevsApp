# Persistence & Data Integrity Tests (Phase 2) — Implementation Plan

## Overview

Rollout Phase 2 of `context/foundation/test-plan.md`. Stand up the project's
first **DB-touching integration harness** against the dedicated cloud Supabase
test project (ref `kqbppawdvnjuxpvrshee`), then prove two risks by writing
through the real handlers and reading the result back from the database:

- **Risk #2 — Persistence & data integrity:** a created/edited card survives a
  reload (no silent data loss).
- **Risk #6 — SRS scheduling:** a graded card gets a persisted future due-date,
  the review counter advances, and `"again"` reschedules sooner than `"good"`.

No production code or schema changes — this phase adds test infrastructure and
tests only.

## Current State Analysis

- **Test runner exists (Phase 1).** Plain `vitest/config` (`vitest.config.ts`),
  `npm test` / `npm run test:watch`, 16 tests under top-level `tests/` mirroring
  `src/`. Phase 1 was DB-free by mocking `@/lib/ai` so `astro:env/server` never
  loaded.
- **The env constraint.** `src/lib/supabase.ts:4` reads `SUPABASE_URL`,
  `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from `astro:env/server`, which is
  unresolvable under the plain Vitest config. DB tests cannot mock the DB seam
  (real read-back is the point), so they need the real config + real clients.
- **Handlers split authz from data access.** `context.locals.user` only gates
  401; the RLS-scoped query runs through `createClient(request.headers,
  cookies)` + `await supabase.auth.getSession()`. The RLS identity
  (`auth.uid()`) comes **only** from the JWT in the `Cookie` header — a fake
  context with only `locals.user` is rejected by RLS (insert→500, edit/grade→
  404). This is `lessons.md:28-33`.
- **No service layer, no GET API.** Read-back must use an independent
  service-role client (or replicate `flashcards.astro:14-29`'s SELECT). There is
  no seam to mock — matching test-plan §2's anti-mock guidance.
- **Test project is ready:** migrations pushed (schema 1:1 confirmed via
  `migration list`), Confirm-email disabled, keys to live in `.env.test`
  (git-ignored; `.env.test.example` template committed).

(Full grounding with file:line refs: `context/changes/persistence-data-integrity/research.md`.)

## Desired End State

- `npm test` runs only the **fast, offline unit project** (Phase-1 behavior
  preserved — no network, no keys required).
- `npm run test:integration` runs the new **integration project** against the
  cloud test project: it creates isolated users, drives the real create / edit /
  grade handlers with authenticated cookies, reads back from the DB, and cleans
  up by deleting the users (cascade).
- Tests prove: created & edited cards persist (read-back equals sent values); a
  graded card has a future `srs_due` with `srs_reps`+1 and `"again"`<`"good"`;
  a graded card leaves GET `/due`.
- `test-plan.md` §6.2/§6.4/§6.6 reflect the DB-read-back patterns; §3 Phase 2 →
  `complete`; `change.md` closed.

### Key Discoveries

- The authenticated-session requirement is the crux — see `research.md` §A/§B
  and `lessons.md:28-33`. Tests must carry a real `sb-<ref>-auth-token` cookie.
- Default Supabase SSR cookie name is `sb-<project_ref>-auth-token` (here
  `sb-kqbppawdvnjuxpvrshee-auth-token`), `base64-`-prefixed JSON, chunked when
  large; no custom `cookieName` is set in `src` (`research.md` §B).
- FK `ON DELETE CASCADE` (`migrations/20260528000000_create_flashcards.sql:5`)
  makes teardown a single `auth.admin.deleteUser` call.
- `SrsState` round-trips **8** columns, excluding `srs_elapsed_days`
  (`types.ts:36-46`, `srs.ts:39-50`); grade UPDATE is optimistically concurrent
  via `.eq("srs_reps", prev)` (`[id]/review.ts:70-75`).
- Oracle discipline (`test-plan.md:63`, §7): assert observable persistence and
  relative ordering, never ts-fsrs intervals/floats.

## What We're NOT Doing

- **No production-code or schema changes** — handlers, `supabase.ts`, `srs.ts`,
  migrations are exercised as-is.
- **No cross-account / IDOR tests** — Risk #3/#4 are Phase 3 (the two-user
  pattern + §6.5 land there). The auth fixture here is built to be reusable by
  Phase 3, but Phase 2 asserts only single-user persistence.
- **No account-deletion test** — Risk #5 is Phase 4.
- **No DELETE-persistence or the 409 concurrency race** — deferred (scope: Core
  + due-list). The harness makes them easy to add later.
- **No CI wiring** — wiring `test:integration` into GitHub Actions (with test
  secrets) is Phase 5.
- **No e2e / Playwright** — deferred by cost×signal (test-plan §4/§6.3).
- **No assertions on exact card text, model id, or ts-fsrs internal numbers.**
- Ignore the experimental `src/pages/api/lesson4*.ts` files and stray
  `test-results.txt` — not fixtures, not under test.

## Implementation Approach

Bootstrap the harness first (infra has no meaningful red test beyond
connectivity), then add the two test layers TDD-style against unchanged
production code, then sync the cookbook. Wiring decisions (confirmed during
planning):

1. **Env: `astro:env/server` alias shim** → the real `src/lib/supabase.ts` runs
   unchanged; read-back via an independent **service-role** client.
2. **Auth: capture cookies via the real sign-in path** → a fixture signs in a
   test user through a cookie-capturing `createServerClient` and replays the
   captured cookie on the request the handler reads (robust to `@supabase/ssr`
   format changes; reuses prod's own cookie-writing code).
3. **Layout: Vitest `projects`** → `unit` (jsdom, offline) and `integration`
   (node, loads `.env.test`), with a `test:integration` script. `npm test` stays
   the fast unit run.
4. **Scope: Core + due-list.**

## Critical Implementation Details

- **The cookie is load-bearing, `locals.user` is not enough.** A test that sets
  only `locals.user` will pass the 401 gate but every RLS write fails
  (insert→500, update/grade→404). The fixture MUST attach a valid
  `sb-kqbppawdvnjuxpvrshee-auth-token` cookie to `request.headers` AND pass a
  working `AstroCookies` as `context.cookies` (so the client's `setAll` token
  refresh doesn't throw). Acquire the cookie by running `signInWithPassword`
  through a `createServerClient` whose `setAll` writes into an in-memory cookie
  jar, then serialize that jar into the `Cookie` header — do not hand-roll the
  base64/chunk format.
- **Keep the integration project off the default run.** `npm test` (the unit
  project) must not load `.env.test` or touch the network — Phase 5/CI and local
  dev depend on the fast path staying offline. Gate by project `include`
  (`tests/integration/**` vs the rest) and per-project `setupFiles`.
- **Test independence (test-plan §4 / CLAUDE.md).** Every test creates its own
  user with a unique email (`test+<timestamp><rand>@example.com`), does its work,
  and deletes that user in teardown; cascade removes the rows. No shared global
  fixtures → safe under Vitest parallelism and re-runs.

## Phase 1: Integration Harness + Fixtures

### Overview

Configure a separate Vitest integration project that can resolve the real
Supabase config and reach the test project, plus the auth/isolation fixtures the
test layers depend on. Prove connectivity with a smoke test; confirm the unit
project still runs offline.

### Changes Required:

#### 1. astro:env/server shim

**File**: `tests/shims/astro-env-server.ts` (new)

**Intent**: Let the real `src/lib/supabase.ts` import `astro:env/server` under
Vitest by re-exporting the values from `process.env`.

**Contract**: named exports `SUPABASE_URL`, `SUPABASE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, each `process.env.<NAME>`.

#### 2. Vitest projects config

**File**: `vitest.config.ts` (modify)

**Intent**: Split into a fast offline `unit` project (current behavior) and an
`integration` project that resolves the shim and runs node-env DB tests, without
making `npm test` hit the network.

**Contract**: define two projects. `unit`: jsdom, `setupFiles:
["./tests/setup.ts"]`, `include` everything under `tests/**` **except**
`tests/integration/**`. `integration`: node environment, `include:
["tests/integration/**/*.{test,spec}.ts"]`, `setupFiles:
["./tests/integration/setup.ts"]`, and a `resolve.alias` entry mapping
`"astro:env/server"` → the shim (resolved via `fileURLToPath(new URL(...))` like
the existing `@` alias). Keep the `@` alias in both. (If a single-config
`projects` array is awkward with the existing default export, a `test.projects`
array is acceptable — verify the installed Vitest 4 API during implement.)

#### 3. Integration env loading + setup

**File**: `tests/integration/setup.ts` (new)

**Intent**: Load `.env.test` into `process.env` for integration tests only,
dep-free, and fail fast with a clear message if keys are missing.

**Contract**: read `.env.test` from repo root, parse `KEY=value` lines into
`process.env` (skip blanks/`#`), then assert `SUPABASE_URL`, `SUPABASE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` are present (throw a descriptive error naming
`.env.test` if not). No new dependency.

#### 4. Test-project client helpers

**File**: `tests/integration/helpers/clients.ts` (new)

**Intent**: Provide the two non-handler clients the fixtures/read-back need.

**Contract**: `adminClient()` → `createClient(URL, SERVICE_ROLE_KEY, { auth: {
autoRefreshToken: false, persistSession: false } })` (service-role, like
`src/lib/supabase.ts:30-37`); `anonClient()` → `createClient(URL, ANON_KEY)`.
Read keys from `process.env`. The project ref constant
(`kqbppawdvnjuxpvrshee`) lives here for cookie naming.

#### 5. Auth + isolation fixture

**File**: `tests/integration/helpers/auth.ts` (new)

**Intent**: Create an isolated, pre-confirmed test user, produce an authenticated
`APIContext` the handlers accept, and a teardown that removes the user.

**Contract**:
- `createTestUser()` → uses `adminClient().auth.admin.createUser({ email:
  unique, password, email_confirm: true })`; returns `{ id, email, password }`.
- `authedContext(user, { url, method, body })` → signs the user in via a
  `createServerClient` (from `@supabase/ssr`) whose `setAll` captures cookies
  into an in-memory jar; serializes the jar (the chunked
  `sb-kqbppawdvnjuxpvrshee-auth-token` cookie) into a `Cookie` header; returns a
  fake `APIContext`-shaped object `{ locals: { user: { id } }, request: new
  Request(url, { method, headers: { Cookie, "content-type": "application/json" },
  body }), cookies: <AstroCookies-compatible stub> }`. The `cookies` stub must
  implement the `get/set/getAll` surface `parseCookieHeader`/`setAll` touch.
- `deleteTestUser(id)` → `adminClient().auth.admin.deleteUser(id)` (cascade
  removes flashcards).

**Contract note (snippet — the one non-obvious bit):** capturing cookies via the
real client avoids hand-rolling the format:

```ts
const jar: Record<string, string> = {};
const client = createServerClient(URL, ANON_KEY, {
  cookies: {
    getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
    setAll: (cs) => cs.forEach(({ name, value }) => (jar[name] = value)),
  },
});
await client.auth.signInWithPassword({ email, password }); // populates jar
const cookieHeader = Object.entries(jar)
  .map(([n, v]) => `${n}=${v}`)
  .join("; ");
```

#### 6. Read-back helper

**File**: `tests/integration/helpers/db.ts` (new)

**Intent**: Read rows straight from the DB (bypassing RLS) so assertions can't be
fooled by the handler's own auth context.

**Contract**: `readFlashcard(id)` and `readFlashcardsByUser(userId)` using
`adminClient()` selecting the columns the assertions need (incl. the 8 SRS
columns for Phase 3-of-this-plan).

#### 7. Connectivity smoke test + npm script

**File**: `tests/integration/smoke.integration.test.ts` (new), `package.json`
(modify)

**Intent**: Prove the integration project resolves config and reaches the test
project, and add the script to run it.

**Contract**: smoke test creates a user via `createTestUser()`, asserts an id
came back, deletes it in teardown. `package.json`: add `"test:integration":
"vitest run --project integration"` (confirm the exact project-filter flag for
Vitest 4 during implement).

### Success Criteria:

#### Automated Verification:

- [ ] Unit project still passes and stays offline: `npm test`
- [ ] Integration smoke passes against the test project: `npm run test:integration`
- [ ] Lint passes: `npm run lint`
- [ ] Build passes: `npm run build`

#### Manual Verification:

- [ ] After a smoke run, the test user no longer exists in the test project
  (Auth → Users) — teardown works.
- [ ] `npm test` run with no `.env.test` present still passes (unit project does
  not require keys).

**Implementation Note**: After this phase and all automated verification passes,
pause for human confirmation before proceeding.

---

## Phase 2: Risk #2 — Create/Edit Persistence

### Overview

Prove a created card and an edited card persist by writing through the real
handlers and reading the row back from the DB — the reload-survival oracle.

### Changes Required:

#### 1. Create-persistence test

**File**: `tests/integration/flashcards/create.integration.test.ts` (new)

**Intent**: Prove POST `/api/flashcards` actually persists the cards it returns
200 for.

**Contract**: with an `authedContext` for a fresh user, invoke the exported
`POST` with a valid `{ cards: [{front, back}] }` body; assert 200 and the
returned `{ saved, cards }` shape; then `readFlashcardsByUser` and assert the
persisted `front`/`back` equal what was sent and `user_id` matches. One case for
the batch (e.g. 2 cards). Teardown deletes the user.

#### 2. Edit-persistence test

**File**: `tests/integration/flashcards/edit.integration.test.ts` (new)

**Intent**: Prove PATCH `/api/flashcards/[id]` persists the edit (the `prd.md:52`
guardrail) and a re-read returns the new values.

**Contract**: seed a card (via POST or admin insert with correct `user_id`),
invoke `PATCH` with new `{ front, back }` and `params.id`; assert 200 `{ card }`;
`readFlashcard(id)` returns the edited values (and `updated_at` advanced).
Include the ownership-miss case: PATCH a random uuid → **404** (RLS hides it).
Teardown deletes the user.

### Success Criteria:

#### Automated Verification:

- [ ] Create + edit persistence tests pass: `npm run test:integration`
- [ ] Lint passes: `npm run lint`

#### Manual Verification:

- [ ] Temporarily breaking the PATCH `.select`/persistence locally makes the
  read-back assertion fail — confirms the test guards real persistence (revert).

**Implementation Note**: After this phase and all automated verification passes,
pause for human confirmation before proceeding.

---

## Phase 3: Risk #6 — SRS Grade & Scheduling

### Overview

Prove a grade persists and schedules: read back the SRS columns after grading,
assert the observable oracle (future due, reps advanced, `"again"`<`"good"`), and
that a graded card leaves the due list. No ts-fsrs internals asserted.

### Changes Required:

#### 1. Grade-persistence + ordering test

**File**: `tests/integration/flashcards/review.integration.test.ts` (new)

**Intent**: Prove POST `/api/flashcards/[id]/review` persists the new schedule
and that ratings order correctly (`test-plan.md:63`).

**Contract**: seed a card (immediately due via defaults). Grade `"good"`; assert
200 `{ card }`, then `readFlashcard`: `srs_due` is in the future (`> now`),
`srs_reps === 1`, `srs_last_review` non-null, `srs_state` ∈ {0..3}, all 8
`SrsState` columns present, `srs_elapsed_days` still at default. Separately, on
two equivalently-seeded cards grade one `"again"` and one `"good"`; assert the
`"again"` card's `srs_due` is **earlier** than the `"good"` card's. Bad rating →
**400**; grading a random uuid → **404**. Teardown deletes the user(s).

#### 2. Due-list behavior test

**File**: `tests/integration/flashcards/due.integration.test.ts` (new)

**Intent**: Prove scheduling is observable through GET `/api/flashcards/due`.

**Contract**: seed a due card; GET `/due` includes it. Grade it `"good"` (pushes
`srs_due` to the future); GET `/due` no longer includes it. Assert ascending
`srs_due` ordering when multiple due cards exist. Teardown deletes the user.

### Success Criteria:

#### Automated Verification:

- [ ] Grade + due tests pass: `npm run test:integration`
- [ ] Lint passes: `npm run lint`

#### Manual Verification:

- [ ] The `"again"`<`"good"` ordering assertion is stable across a few re-runs
  (FSRS fuzz does not flip the relative order) — confirms the oracle is robust.

**Implementation Note**: After this phase and all automated verification passes,
pause for human confirmation before proceeding.

---

## Phase 4: Cookbook + Plan Sync

### Overview

Capture the DB-integration patterns in the test plan so Phases 3–4 reuse them,
and advance the rollout status.

### Changes Required:

#### 1. Cookbook patterns

**File**: `context/foundation/test-plan.md` (§6.2, §6.4, §6.6)

**Intent**: Replace the Phase-2 "TBD/extended later" notes with the concrete
DB-read-back recipe.

**Contract**: §6.2 — fill the DB read-back half (Vitest integration project,
service-role read-back, unique-user isolation + cascade teardown). §6.4 — extend
the endpoint pattern with the `astro:env/server` shim + the captured-cookie
authenticated-context recipe for DB-touching handlers. §6.6 — a 2–3 line note on
what this phase taught (shim discovery, cookie-capture-not-hand-roll, projects
split keeps `npm test` offline). Add/refresh `checked:` dates.

#### 2. Stack note

**File**: `context/foundation/test-plan.md` (§4)

**Intent**: Record the integration-project layout and the dep-free `.env.test`
loading; note the test project is in use for DB read-back.

**Contract**: update the relevant §4 row(s)/notes with the projects split and
env-loading approach; `checked:` date.

#### 3. Rollout status

**File**: `context/foundation/test-plan.md` (§3 table) and
`context/changes/persistence-data-integrity/change.md`

**Intent**: Advance Phase 2 to `complete` and close the change identity.

**Contract**: §3 Phase 2 Status → `complete`, Change folder →
`context/changes/persistence-data-integrity/`; `change.md` → done state,
`updated:` today.

### Success Criteria:

#### Automated Verification:

- [ ] Unit suite green and offline: `npm test`
- [ ] Integration suite green: `npm run test:integration`
- [ ] Lint + build pass: `npm run lint` && `npm run build`

#### Manual Verification:

- [ ] A reader of `test-plan.md` §6.2/§6.4 can write a new DB-touching
  integration test without reading this plan.

---

## Testing Strategy

### Integration Tests (this phase):

- Create: POST then admin read-back equals sent values (batch of 2).
- Edit: PATCH then read-back equals new values; `updated_at` advanced; foreign
  id → 404.
- Grade: `"good"` → future due, reps+1, last_review set, columns round-trip;
  `"again"`<`"good"` ordering; bad rating → 400; foreign id → 404.
- Due: due card listed; disappears after `"good"`; ascending order.

### Manual Testing Steps:

1. `npm test` (offline, no keys) → unit green.
2. `npm run test:integration` → all green; users cleaned up afterward (verify in
   panel once).
3. Locally break a `.select`/persistence → corresponding read-back fails (revert).

## Performance Considerations

Integration tests make real network round-trips to the cloud test project; keep
them off the default `npm test` so the inner dev loop stays fast. Per-test user
create+delete is a few calls; acceptable for the handful of tests here.

## Migration Notes

None — no schema or data migrations. The test project schema is already 1:1 with
prod migrations.

## References

- Research: `context/changes/persistence-data-integrity/research.md`
- Risks + oracle: `context/foundation/test-plan.md` §2 (#2, #6), §3 Phase 2, §4,
  §6, §7 (`:63` ordering oracle)
- Phase-1 precedent: `context/changes/testing-ai-generation-robustness/plan.md`
  (vitest config, `tests/` layout, direct-handler invoke)
- Lessons: `context/foundation/lessons.md:14-19` (GRANT), `:28-33` (getSession
  hydration), `:35-40` (full-record return)
- Handlers: `src/pages/api/flashcards/index.ts`, `[id].ts`, `[id]/review.ts`,
  `due.ts`; client `src/lib/supabase.ts:6-37`; SRS `src/lib/srs.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Integration Harness + Fixtures

#### Automated

- [x] 1.1 Unit project still passes and stays offline: `npm test` — a631f6b
- [x] 1.2 Integration smoke passes against the test project: `npm run test:integration` — a631f6b
- [x] 1.3 Lint passes: `npm run lint` — a631f6b
- [x] 1.4 Build passes: `npm run build` — a631f6b

#### Manual

- [x] 1.5 After a smoke run, the test user no longer exists in the test project (teardown works) — a631f6b
- [x] 1.6 `npm test` with no `.env.test` present still passes (unit needs no keys) — a631f6b

### Phase 2: Risk #2 — Create/Edit Persistence

#### Automated

- [x] 2.1 Create + edit persistence tests pass: `npm run test:integration` — 7fcb0b5
- [x] 2.2 Lint passes: `npm run lint` — 7fcb0b5

#### Manual

- [x] 2.3 Breaking PATCH persistence locally makes the read-back assertion fail (revert) — 7fcb0b5

### Phase 3: Risk #6 — SRS Grade & Scheduling

#### Automated

- [x] 3.1 Grade + due tests pass: `npm run test:integration` — e4d63f9
- [x] 3.2 Lint passes: `npm run lint` — e4d63f9

#### Manual

- [x] 3.3 The "again"<"good" ordering is stable across a few re-runs (fuzz doesn't flip it) — e4d63f9

### Phase 4: Cookbook + Plan Sync

#### Automated

- [x] 4.1 Unit suite green and offline: `npm test` — b76b7a0
- [x] 4.2 Integration suite green: `npm run test:integration` — b76b7a0
- [x] 4.3 Lint + build pass: `npm run lint` && `npm run build` — b76b7a0

#### Manual

- [x] 4.4 §6.2/§6.4 are self-sufficient for writing a new DB-touching integration test — b76b7a0
