# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-14 (test environment fixed: a dedicated cloud Supabase test project for all DB-touching tests; e2e feasible there but deferred by cost × signal; Phase 5 optional)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in <area>"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/` (excluding build
output, lockfiles, snapshots).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|--------------------------|--------|------------|--------------------------------|
| 1 | LLM call returns a corrupted, empty, error, or timed-out response and the generate flow breaks — blank/frozen screen or crash instead of a clean error plus manual-creation fallback. | High | High | interview Q1 (top fear); PRD FR-003/FR-004; PRD NFR ("feedback within 2s"); infrastructure.md risk register (50ms CPU limit, CJS crash); hot-spot dir `src/pages/api/` (25 commits/30d) |
| 2 | A created or edited card shows "saved" but does not persist — survives the request but not a reload. Violates the PRD guardrail; user loses study work. | High | Medium | PRD Guardrails ("must survive reload"); interview Q3 (deck management = low confidence); lessons.md (GRANT, `getSession()`, full-record-vs-`{id}` classes); hot-spot dirs `src/components/flashcards/` (6/30d), `src/pages/api/` (25/30d) |
| 3 | One user reads or mutates another user's cards or review history (IDOR / RLS gap) — endpoint checks "logged in" not "owns this row", or a query runs with anon key (`auth.uid()` null). | High | Medium | PRD NFR ("no cross-account data leakage under any request path"); abuse/security lens; lessons.md (session hydration); hot-spot dir `src/pages/api/` (25/30d) |
| 4 | An unauthenticated or stale-session request reaches a gated route or user data — gating fails, or the Cloudflare cookie silently does not set, producing an open route or a redirect loop. | High | Medium | PRD Access Control (redirect to sign-in); infrastructure.md risk register (Supabase SSR cookie fails silently on Cloudflare); hot-spot dir `src/` file `src/middleware.ts` (5/30d) |
| 5 | A "deleted" account leaves data behind or can sign in again — review-history rows orphaned, or the `auth.users` record not removed because the service-role delete path fails. | High | Low | PRD FR-011 (RODO art. 17); roadmap S-04 risk; PRD NFR (data unreachable under any path) |
| 6 | SRS scheduling loses or mis-schedules review progress — a grade is not persisted, or due-date math is wrong, so cards never come due or history is off. | Medium | Medium | PRD FR-009/FR-010; roadmap S-03 (`ts-fsrs`); hot-spot dir `src/pages/api/` (review path, 25/30d) |

Parked (not a top row): AI-cost resource-abuse (mass-triggering generation).
High impact but Low likelihood at single-digit-user MVP scale with no
rate-limiting in scope — belongs to observability/alerting later, not a test now.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Malformed JSON, empty content, 5xx, and timeout from OpenRouter each yield a clean error state plus manual fallback — never a crash or frozen UI. | "HTTP 200 means usable cards" (could be an empty array or unparseable body). | Where the LLM response is parsed and mapped to cards; how errors surface to the React island; timeout handling under workerd. | integration (generate endpoint with **mocked** OpenRouter) | Asserting exact card text (oracle problem — output is non-deterministic). |
| #2 | After save, re-reading from the DB returns the new/edited values. | "Endpoint returned 200, therefore it persisted." | Mutation contract (full record vs `{id}`), session hydration, GRANT/RLS write path. | integration (POST/PATCH then read-back) on the cloud test project | Over-mocking Supabase so the test only mirrors the handler. |
| #3 | User B requesting User A's card id gets 404/403 and no data; a cross-user write is rejected. | "Logged in implies authorized for this row." | How ownership is enforced (RLS `auth.uid()` vs explicit filter). | integration (two users) on the cloud test project | Happy-path-only (own-resource) testing; mocking the DB — RLS is never exercised, so it needs the real test DB. |
| #4 | An unauthenticated request to each gated route redirects to sign-in; no user data leaks. | "PROTECTED_ROUTES covers everything"; "the cookie always sets on Cloudflare." | Gating list, middleware redirect path, session-cookie shape. | integration / middleware test | Testing one route and assuming the rest. |
| #5 | Post-deletion: this user's flashcards **and** review history are gone, and re-login is refused. | "Cascade exists, therefore all data is gone." | Which tables cascade off `auth.users`; the service-role delete path; test-env feasibility. | integration on the cloud test project (needs the test project's service-role key, never prod); e2e feasible there too but deferred by cost × signal | Asserting deletion of hypothetical future tables — test what exists; mocking the cascade — it proves nothing, so it needs the real test DB. |
| #6 | A graded card gets a persisted future due-date; "again" reschedules sooner than "good". | "Review submitted, therefore scheduled correctly." | The `ts-fsrs` wrapper and where the grade is persisted. | unit / integration (wrapper plus read-back on the cloud test project) | Copying `ts-fsrs` internal numbers into assertions (tests the library, not our integration). |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

> **Test-environment prerequisite.** There is no local database (Supabase is
> cloud-only, no local Docker). Every DB-touching phase below runs against a
> **dedicated cloud Supabase test project** — never production (see §4).
> **Phase 1 is the only DB-free phase** (it mocks OpenRouter at the network
> edge), so it can start immediately. **Phases 2–4 require the cloud test
> project to exist and be seeded from `supabase/migrations/` first.**

> **Phase 2 prerequisite — stand up the cloud test project (human-run, before any DB test).**
> Goal: a test project whose schema is **1:1 with prod**. `supabase db push`
> reproduces the schema only if prod was built entirely through migrations, so
> before relying on it:
>
> 1. Create the test project by hand in the Supabase panel (secrets/destructive
>    = human-only). Put its own keys — including its own service-role key — into
>    CI/test env vars; never reuse production keys.
> 2. Seed the schema: `supabase db push` to the test project from
>    `supabase/migrations/`.
> 3. Verify the migrations actually carry — these are what the risks depend on:
>    - **RLS policies** (fundamental to #3) — a policy created by hand in the prod
>      dashboard won't be in the migrations, so isolation would pass falsely.
>    - **GRANTs** (the `lessons.md` GRANT class) must be in the migrations.
>    - **Cascade / FK off `auth.users`** (fundamental to #5) must be defined in a
>      migration, not assumed from a manual prod tweak.
> 4. Set **auth config by hand** in the test project — it is project settings,
>    not SQL, so migrations won't carry it: disable email confirmation (or create
>    pre-confirmed users via the admin API), otherwise two-user (#3) and login
>    flows stall on confirm-email.
> 5. Confirm 1:1: `supabase db diff` against the migrations (or prod) should be
>    empty.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|----------------|------------|--------|---------------|
| 1 | Bootstrap + AI-generation robustness | Stand up the runner; prove the generate flow stays sane on bad/empty/error/slow LLM responses | #1 | unit + integration (mocked OpenRouter; no DB) | planned | context/changes/testing-ai-generation-robustness/ |
| 2 | Persistence & data integrity | Prove card create/edit survives reload and SRS grades persist and schedule | #2, #6 | integration (DB read-back on cloud test project) | not started | — |
| 3 | Authorization & isolation | Prove no cross-account read/write and that gated routes reject unauthenticated requests | #3, #4 | integration (two users + middleware, on cloud test project) | not started | — |
| 4 | Account-deletion completeness | Prove RODO delete removes all of this user's data and blocks re-login | #5 | integration (service-role + DB read-back on cloud test project) | not started | — |
| 5 | Quality gates + AI-native generation probe **(optional)** | Wire lint/typecheck/unit+integration into CI; add one sampled LLM-as-judge probe on generation relevance/structure | cross-cutting | gates + AI-native | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration | none yet — see Phase 1 | — | No runner configured today; Phase 1 bootstraps it. Vitest is the natural fit for an Astro + Vite project — confirm via `/10x-research` in Phase 1. |
| API / HTTP mocking | none yet — see Phase 1 | — | OpenRouter calls must be mocked at the network edge (e.g. MSW). Decision belongs to Phase 1 research. |
| e2e | feasible on the cloud test project — deferred by cost × signal | — | Not blocked by infrastructure: Playwright bundles its own browsers and the app runs via `wrangler dev` / a preview against the cloud test project (no Docker needed). Deferred because integration on the test DB gives the same signal for the current risks more cheaply. Revisit for the north-star UI flow (full UI → middleware → cookie → handler → DB crossing). |
| (optional) AI-native | LLM-as-judge — checked: 2026-06-10 | n/a | When NOT to use: never gate CI on it and never assert exact text; it is a periodic, sampled probe on whether generated cards are structurally valid and on-topic for the source, not a per-PR deterministic test. |

**Test base today: `none`** — no runner config, zero test files, no `test`
script. Phase 1 is a true bootstrap.

**Test environment (settled): a dedicated cloud Supabase test project.**
Supabase is cloud-only and there is no local Docker, so there is **no local
database**. We do **not** test against production. Instead we stand up a
**separate cloud Supabase project used only for tests**, seeded from
`supabase/migrations/` (`supabase db push` to the test project). Every test
that touches the database runs there — persistence read-back (#2, #6),
two-user RLS isolation (#3), and account-deletion cascade + service-role
delete (#5) — **never against prod**. The test project carries its own keys
(including its own service-role key) in CI/test env vars; production keys are
never used by tests. Mocking the database is rejected for #3 and #5: RLS and
cascade-on-delete are database behaviours, and a mock would only mirror the
handler (see the §2 anti-patterns). **Phase 1 is the exception** — it mocks
OpenRouter at the network edge and touches no database, so it needs no test
project and can start immediately.

**Stack grounding tools (current session):**
- Docs: Context7 — available; can ground current Vitest / Playwright / `@supabase/ssr` / `ts-fsrs` test setup. Not yet queried (deferred to per-phase research); checked: 2026-06-10
- Search: Exa.ai — available; for discovering current official test-setup docs / tool status; checked: 2026-06-10
- Runtime/browser: none in current session — Playwright MCP not exposed; checked: 2026-06-10
- Provider/platform: none as MCP — Cloudflare and Supabase are managed manually per the project's deployment rules; checked: 2026-06-10

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local + CI | required (already wired — `npm run lint`, GH Actions ci.yml) | syntactic / type drift |
| unit + integration | local + CI (cloud test project for DB tests) | required after §3 Phase 1 | logic regressions, LLM-response mishandling, silent persistence loss |
| account-deletion completeness | local + CI (cloud test project) | required after §3 Phase 4 (integration on the test DB) | incomplete account deletion |
| e2e on critical flows | CI on PR (cloud test project) | deferred by cost × signal — feasible on the test project; revisit for the north-star UI flow | broken north-star flow |
| post-edit hook | local (agent loop) | recommended after §3 Phase 5 | regressions at edit time |
| AI-native generation probe | CI (sampled, non-blocking) | optional after §3 Phase 5 (Phase 5 itself optional) | generation drifting off-topic or producing structurally invalid cards |
| pre-prod smoke | between merge + prod | optional | environment-specific failures (workerd CPU, cookie-on-Cloudflare) |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- TBD — see §3 Phase 1 (runner bootstrap; SRS-wrapper scheduling pattern lands in Phase 2).

### 6.2 Adding an integration test

- TBD — see §3 Phase 1 for the mocked-OpenRouter generate-endpoint pattern; extended by Phase 2 (DB read-back) and Phase 3 (two-user authorization). All DB read-back runs against the dedicated cloud Supabase test project (see §4), never prod.

### 6.3 Adding an e2e test

- Feasible on the cloud Supabase test project (Playwright bundles its own
  browsers; the app runs via `wrangler dev` / a preview — no Docker needed),
  but deferred by cost × signal: integration on the test DB covers the current
  risks more cheaply. Fill this in if/when the north-star UI flow gets e2e
  coverage. Until then, account-deletion and persistence live at the
  integration layer (see §6.2 and §3 Phase 4).

### 6.4 Adding a test for a new API endpoint

- TBD — see §3 Phase 1. Will capture: how to exercise an Astro API route, where to mock the external HTTP edge (OpenRouter), and how to assert both response shape and DB side-effects under RLS. DB side-effects are asserted against the cloud test project (see §4), never prod.

### 6.5 Adding a test for cross-account isolation

- TBD — see §3 Phase 3 (two-user IDOR pattern: user B cannot read/mutate user A's resource id). Runs on the cloud test project so real RLS is exercised (see §4).

### 6.6 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2-3 line note
here capturing anything surprising the phase taught.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **UI rendering / styling** — component appearance, layout, shadcn/ui primitives in `src/components/ui/`. Test behavior and data contracts, not how pixels look. Re-evaluate if a visual regression causes a real incident. (Source: Phase 2 interview Q5.)
- **Cloudflare and Supabase as platforms** — do not test the workerd runtime, the Cloudflare deploy surface, or Supabase-the-service. Test *our code's contract* with them (our API routes, our RLS policies' effect, our cookie handling), not the providers. Re-evaluate if a provider behavior change breaks us silently. (Source: Phase 2 interview Q5.)
- **Production data** — tests never run against the production Supabase project. All DB-touching tests run on the dedicated cloud test project (see §4). (Source: this session's test-environment decision, 2026-06-14.)
- **Exact LLM output content** — generated card text is non-deterministic; never assert specific strings. Structural validity and on-topic relevance are covered by the sampled AI-native probe (§3 Phase 5), not by deterministic assertions. (Source: derived from interview Q1 + Q5; oracle-problem guardrail.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-14
- Stack versions last verified: 2026-06-10
- AI-native tool references last verified: 2026-06-10
- Test environment decided (dedicated cloud Supabase test project): 2026-06-14

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
