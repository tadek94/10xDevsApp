# Persistence & Data Integrity Tests (Phase 2) — Plan Brief

> Full plan: `context/changes/persistence-data-integrity/plan.md`
> Research: `context/changes/persistence-data-integrity/research.md`

## What & Why

Phase 2 of the test-plan rollout. Build the project's first **DB-touching
integration harness** against the cloud Supabase test project, then prove two
risks by writing through the real handlers and reading the result back from the
database: **Risk #2** (a created/edited card survives a reload — no silent data
loss) and **Risk #6** (a graded card gets a persisted future due-date and
`"again"` reschedules sooner than `"good"`).

## Starting Point

A Vitest runner exists from Phase 1 (16 unit tests, top-level `tests/`), but it
is DB-free — it mocked `@/lib/ai` so `astro:env/server` never loaded. The test
project is ready: migrations pushed (schema 1:1), Confirm-email off, keys in
`.env.test`. The gap: there is no way yet for a test to reach the DB with a real
authenticated session.

## Desired End State

`npm test` stays fast and offline (unit only); a new `npm run test:integration`
creates isolated users, drives the real create/edit/grade handlers with
authenticated cookies, reads back from the DB, and deletes the users (cascade)
afterward. The cookbook (test-plan §6) documents the pattern for Phases 3–4.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Env wiring | `astro:env/server` alias shim + service-role read-back | Runs the real `supabase.ts` so the cookie→getSession→RLS seam is exercised end-to-end | Plan |
| Authenticated session | Capture cookies via the real sign-in path | Reuses prod's cookie-writing code; robust to `@supabase/ssr` format/chunking changes | Plan |
| Test layout | Vitest `projects` (unit + integration) | Keeps `npm test` fast/offline; DB tests opt in via `test:integration` | Plan |
| Assertion scope | Core + due-list | Covers both risks' oracles plus one cheap high-value behavior | Plan |
| Isolation/cleanup | Unique user per test + `deleteUser` cascade | Parallel-safe, no shared fixtures (CLAUDE.md /10x-e2e rule, FK cascade) | Research |
| Oracle discipline | Observable persistence + relative ordering only | Never assert ts-fsrs internals — that tests the library, not our code | Research |

## Scope

**In scope:** integration harness (projects config, env shim, `.env.test`
loader, auth/isolation fixtures, service-role read-back); create + edit
persistence (#2); grade persistence + `again`<`good` ordering + due-list (#6);
cookbook/plan sync.

**Out of scope:** cross-account/IDOR (Phase 3), account-deletion (Phase 4),
DELETE-persistence & 409 concurrency, CI wiring (Phase 5), e2e; any
production-code or schema change.

## Architecture / Approach

A second Vitest project (`integration`, node env) aliases `astro:env/server` to a
shim reading `process.env` (loaded from `.env.test`), so the real
`src/lib/supabase.ts` runs. A fixture creates a pre-confirmed unique user via the
service-role admin API, signs in through a cookie-capturing `createServerClient`,
and replays the captured `sb-kqbppawdvnjuxpvrshee-auth-token` cookie on a fake
`APIContext`; the exported handler is invoked directly (Phase-1 pattern extended
with real auth). Assertions read back through an independent service-role client
that RLS can't fool. Teardown deletes the user; the FK cascade removes the rows.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Harness + fixtures | Vitest projects, shim, `.env.test` loader, auth/isolation + read-back helpers, connectivity smoke | Cookie capture/replay format; keeping `npm test` offline |
| 2. Create/edit (#2) | POST/PATCH → DB read-back equals sent values | Seeding rows with correct `user_id` under RLS |
| 3. Grade/scheduling (#6) | Grade → future due, reps+1, `again`<`good`; due-list behavior | FSRS fuzz; asserting only observable/relative facts |
| 4. Cookbook + sync | test-plan §6.2/§6.4/§6.6 filled; Phase 2 → complete | Keeping docs self-sufficient |

**Prerequisites:** test project ready (✅ migrations 1:1, Confirm-email off);
`.env.test` filled with the test project's URL/anon/service-role keys.
**Estimated effort:** ~2–3 sessions across 4 phases (Phase 1 is the bulk).

## Open Risks & Assumptions

- Cookie capture-and-replay depends on `@supabase/ssr`'s default cookie format;
  capturing via the real client (not hand-rolling) mitigates breakage.
- Vitest 4 `projects`/`--project` API specifics confirmed during implement.
- FSRS fuzz is assumed not to flip the `again`<`good` ordering on default weights
  (verified by a manual re-run check in Phase 3).
- Integration tests require network access to the test project (not offline).

## Success Criteria (Summary)

- A created/edited card read straight from the DB matches what was sent.
- A graded card has a future `srs_due`, `srs_reps`+1, and `"again"`<`"good"`; it
  leaves GET `/due` after a `"good"`.
- `npm test` stays fast/offline; `npm run test:integration` is green and leaves
  no test users behind.
