# E2E Testing Rules (Playwright)

The quality lever the agent reads before generating any E2E test in this repo.
Pair it with the exemplar `tests/e2e/seed.spec.ts` — what the seed shows is what
generated tests inherit.

## Rules block

- Use `getByRole`, `getByLabel`, `getByText` as primary locators. Fall back to
  `getByTestId` only when accessibility attributes are ambiguous.
- Never use CSS selectors, XPath, or DOM structure to locate elements.
- Each test must be independently runnable — own setup, action, assertion, and
  cleanup; no shared state between tests. Safe under parallel, random-order runs.
- Never use `page.waitForTimeout()`. Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- Assert the business outcome, not implementation details. Control question:
  *would this assertion fail if the `test-plan.md` risk materialized?* If not,
  it's decorative.
- Use unique identifiers (timestamp suffix) for test data; create the user via
  the service-role admin API (`tests/e2e/helpers/supabase.ts`) and delete it in
  `afterAll` — the FK cascade removes its rows.
- Internal boundaries (auth, routing, DB) stay **real** — that's where
  integration risk hides. Mock only expensive/non-deterministic external APIs
  (e.g. the LLM) at the network layer.
- Name the test after the risk: `test('a manually added card survives a full
  page reload', …)`, not `test('test 1', …)`.

## Project specifics

- **Runs against the cloud TEST project only.** `playwright.config.ts` loads
  `.env.test` and starts the dev server with `--mode test` (port 4329); prod is
  never touched. Never point E2E at prod Supabase.
- **Auth**: sign in through the real form (`/auth/signin`, `getByLabel('Email')`
  / `getByLabel('Password')` / `getByRole('button', { name: 'Sign in' })`); a
  successful sign-in redirects to `/`. For tests where login is *not* the risk,
  prefer a `storageState` setup instead of signing in via the UI each time.
- **Single spec run**: `npx playwright test tests/e2e/<file>.spec.ts`.
