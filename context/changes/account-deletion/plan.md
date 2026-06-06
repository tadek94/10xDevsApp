# Account Deletion (RODO Art. 17) Implementation Plan

## Overview

Give a logged-in user a way to **permanently delete their own account and all associated data**, after an explicit confirmation, then sign them out and prevent re-login with that account. This realizes RODO Art. 17 ("right to be forgotten", proposed FR-011) and closes the account lifecycle opened by FR-001 (account creation).

The deletion runs server-side through a Supabase **admin client** (new `SUPABASE_SERVICE_ROLE_KEY`) calling `auth.admin.deleteUser(user.id)`. Deleting the `auth.users` row cascades to the user's `flashcards` (the only user-owned table), so all data — cards plus their inline SRS/review history columns — is removed in one operation.

## Current State Analysis

- **Auth flow.** `src/lib/supabase.ts` builds a cookie-bound `createServerClient` using the anon `SUPABASE_KEY` (read from `astro:env/server`). `src/middleware.ts` resolves `context.locals.user` on every request and redirects unauthenticated users away from `PROTECTED_ROUTES` (`/dashboard`, `/generate`, `/flashcards`, `/review`). Sign-out is `POST /api/auth/signout` → `supabase.auth.signOut()` → redirect `/`.
- **Data model.** `flashcards` is the **only** user-owned table. Its FK is `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` (`supabase/migrations/20260528000000_create_flashcards.sql:4`). SRS/review state is *columns on* `flashcards` (`supabase/migrations/20260605000000_add_srs_fields.sql`), **not** a separate table. **The cascade for full deletion already exists** — no schema/migration change is required for this change.
- **API conventions.** Endpoints (`src/pages/api/...`) export named handlers, `export const prerender = false`, gate on `context.locals.user` (401 if absent), validate input with zod, hydrate the session via `await supabase.auth.getSession()` before RLS queries, and return `Response.json(...)`. See `src/pages/api/flashcards/[id].ts`.
- **The anon client cannot delete an auth user.** `auth.admin.deleteUser` requires the service-role key, which the SSR client does not use. This is the single architectural gap this plan closes.
- **Env conventions.** Secrets are declared in `astro.config.mjs` under `env.schema` as `envField.string({ context: "server", access: "secret", optional: true })` and read from `astro:env/server`. `supabase.ts` returns `null` when env vars are missing so pages degrade gracefully. Local dev reads `.env` (Node) or `.dev.vars` (wrangler).

## Desired End State

A logged-in user navigates to a new `/account` page, ticks an "I understand this is permanent" checkbox (which enables the delete button), and clicks **Delete my account**. The browser POSTs to `/api/account/delete`; the server deletes the user via the admin client, the cascade removes their flashcards, the session cookies are cleared, and the user lands on `/` with a visible "your account has been deleted" notice. Attempting to sign in again with that account is rejected (the user no longer exists). If deletion fails server-side, the user stays logged in and sees an error to retry.

Verify: after deletion, (1) re-login is refused, (2) the user's flashcards are gone from the DB, (3) no app path returns that user's data (NFR account isolation).

### Key Discoveries:

- Cascade already covers everything — only `flashcards` references `auth.users`, with `ON DELETE CASCADE` (`supabase/migrations/20260528000000_create_flashcards.sql:4`).
- SRS history is columns, not a table (`supabase/migrations/20260605000000_add_srs_fields.sql:10-19`) — nothing extra to delete.
- Secret declaration pattern: `astro.config.mjs:17-22` `env.schema`, read via `astro:env/server` (`src/lib/supabase.ts:3`).
- Session-clearing pattern to reuse: `supabase.auth.signOut()` from the cookie-bound SSR client (`src/pages/api/auth/signout.ts`).
- Protected-route registration: append to `PROTECTED_ROUTES` in `src/middleware.ts:4`.
- No new table ⇒ the GRANT / RLS-hydration lessons (`context/foundation/lessons.md`) do **not** apply to the admin deletion path (service role bypasses RLS); they remain relevant only to ordinary cookie-bound queries.

## What We're NOT Doing

- **No soft delete / grace period / scheduled purge** — deletion is immediate and irreversible (hard delete + cascade), per RODO "without undue delay".
- **No schema/migration changes** — the cascade already exists; no new tables or FKs.
- **No new account-settings features** beyond deletion — `/account` is introduced as the home for deletion only (it can grow later, but that's out of scope here).
- **No admin-facing deletion** (deleting *other* users) — strictly self-service; the endpoint deletes `locals.user.id` only and never trusts a client-supplied id.
- **No email confirmation / re-authentication step** before deletion — the checkbox + explicit button is the agreed confirmation (FR-008 style).
- **No audit log / retention record** of the deletion event in MVP.
- **No automated test suite** — none is configured; verification is lint + build + manual (per CLAUDE.md).

## Implementation Approach

Three phases, back-to-front. Phase 1 builds the server capability (secret + admin client + endpoint) so it can be exercised independently. Phase 2 builds the UI that drives it (page, island, link, notice) and registers the route as protected. Phase 3 is a documentation-only update closing FR-011 in the PRD.

The admin client is a **separate** helper from the existing cookie-bound `createClient` — it uses the service-role key, no cookie/session wiring, and must never be importable into client code. The endpoint uses the admin client *only* for the privileged delete, and the ordinary cookie-bound client to clear the caller's session.

## Critical Implementation Details

- **Self-deletion only.** The endpoint must derive the target id from `context.locals.user.id`, never from the request body. There is no parameter for "which user" — this prevents the privileged admin client from ever being steered at another account.
- **Order of operations on success: delete first, then clear session.** Call `auth.admin.deleteUser(user.id)`; only if it succeeds, call `supabase.auth.signOut()` on the cookie-bound client to emit the session-clearing `Set-Cookie` headers. On failure, do NOT sign out — the account must be either fully gone or fully intact (no "looks deleted but isn't" limbo).
- **Secret absence must fail closed.** If `SUPABASE_SERVICE_ROLE_KEY` is missing, `createAdminClient()` returns `null` and the endpoint returns a 500 (mirroring the existing "not configured" pattern) — it must not fall back to the anon client or pretend success.
- **Service-role key is full-privilege.** Per Deployment rules: env-var only, never in a tracked file (`.env.example`/`.dev.vars` get the *key name* with an empty/placeholder value only), added to production by hand.

---

## Phase 1: Backend — secret, admin client & delete endpoint

### Overview

Declare the service-role secret, add a server-only admin Supabase client, and build the self-service deletion endpoint.

### Changes Required:

#### 1. Env schema — declare the service-role secret

**File**: `astro.config.mjs`

**Intent**: Make `SUPABASE_SERVICE_ROLE_KEY` available via `astro:env/server` so the admin client can read it, following the existing secret pattern.

**Contract**: Add to `env.schema`: `SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: "server", access: "secret", optional: true })`. `optional: true` keeps local/CI builds working without the secret (degrade gracefully like `SUPABASE_KEY`).

#### 2. Document the new env var (untracked-value placeholders)

**File**: `.env.example` and `.dev.vars` (whichever is tracked — add the key name only, no real value)

**Intent**: Tell developers the variable exists and where to put it, without committing a secret.

**Contract**: Add a line `SUPABASE_SERVICE_ROLE_KEY=` (empty) with a short comment noting it is the Supabase service-role key, server-only, added to production by hand.

#### 3. Admin Supabase client helper

**File**: `src/lib/supabase.ts`

**Intent**: Add a `createAdminClient()` that constructs a Supabase client authenticated with the service-role key for privileged operations (no cookie/session wiring). Returns `null` if the key (or URL) is missing, mirroring `createClient`.

**Contract**: New exported function `createAdminClient(): SupabaseClient | null`. Uses the plain `@supabase/supabase-js` `createClient` (not `createServerClient`) with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` and `auth: { autoRefreshToken: false, persistSession: false }`. Imports the new key from `astro:env/server`. This client must only ever be used server-side.

#### 4. Account-deletion endpoint

**File**: `src/pages/api/account/delete.ts`

**Intent**: Self-service deletion. Authenticated user deletes their own account; on success cascade removes their flashcards and the session is cleared; on failure the session is preserved and an error returned.

**Contract**: `export const prerender = false;` and `export const POST: APIRoute`. Flow:
1. `const user = context.locals.user;` → 401 JSON if absent.
2. `const admin = createAdminClient();` → 500 JSON `{ error: "Account deletion is not configured" }` if `null`.
3. `const { error } = await admin.auth.admin.deleteUser(user.id);` — target is `user.id` only (never request body).
4. On error: log it, return 500 JSON `{ error: "Failed to delete account" }` **without** signing out.
5. On success: create the cookie-bound client (`createClient(...)`) and `await supabase.auth.signOut()` to emit session-clearing cookies, then return 200 JSON `{ ok: true }`. (Client-side redirect to `/?deleted=1` is handled by the island in Phase 2.)

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- With `SUPABASE_SERVICE_ROLE_KEY` set locally, POSTing to `/api/account/delete` while logged in returns `{ ok: true }`, removes the `auth.users` row, and the user's `flashcards` rows are gone (verify in Supabase).
- Re-login with the deleted account is refused.
- With the secret unset, the endpoint returns a 500 "not configured" and does NOT log the user out.
- Simulated delete failure (e.g. bad key) keeps the session intact and returns an error.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Frontend — /account page & delete flow

### Overview

Add the protected `/account` page, the checkbox-gated delete island, the dashboard entry point, and the post-deletion notice on the homepage.

### Changes Required:

#### 1. Register `/account` as protected

**File**: `src/middleware.ts`

**Intent**: Require auth for the new account page.

**Contract**: Append `"/account"` to the `PROTECTED_ROUTES` array (line 4).

#### 2. Account page

**File**: `src/pages/account.astro`

**Intent**: A protected settings page whose only content (for now) is a "danger zone" hosting the delete flow. Renders the delete island and passes the user's email for display.

**Contract**: Uses `Layout`, reads `Astro.locals.user`, renders a heading + short explanatory copy that deletion is permanent and removes all flashcards, and mounts the `DeleteAccountForm` React island with `client:load`. Visual style consistent with `dashboard.astro`.

#### 3. Delete-account island

**File**: `src/components/DeleteAccountForm.tsx`

**Intent**: Client component handling the confirmation interaction: a checkbox gates the delete button; clicking it POSTs to the endpoint and handles the result.

**Contract**: React component (no Next.js directives). State: `confirmed` (checkbox) and `submitting`/`error`. The delete button is `disabled` unless `confirmed && !submitting`. On click: `fetch("/api/account/delete", { method: "POST" })`; on `res.ok` → `window.location.assign("/?deleted=1")`; otherwise read the JSON error, show it, and re-enable. Uses `cn()` for class merging; styling consistent with existing buttons.

#### 4. Dashboard entry point

**File**: `src/pages/dashboard.astro`

**Intent**: Link users to the new account page.

**Contract**: Add an `<a href="/account">` (e.g. "Ustawienia konta" / "Account") alongside the existing action links, styled to match. No other dashboard changes (S-05 owns dashboard polish).

#### 5. Post-deletion notice on homepage

**File**: `src/pages/index.astro`

**Intent**: When redirected with `?deleted=1`, show a one-off confirmation that the account was deleted.

**Contract**: Read `Astro.url.searchParams.get("deleted")`; when `"1"`, render a dismissible/static notice (e.g. "Twoje konto zostało trwale usunięte."). Purely presentational; no state persisted.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Visiting `/account` while logged out redirects to `/auth/signin`.
- The delete button is disabled until the checkbox is ticked.
- Completing the flow deletes the account and lands on `/` with the "account deleted" notice visible.
- After deletion, navigating to any protected route redirects to sign-in.
- A failed deletion shows an inline error and the user remains on `/account`, still logged in.
- Dashboard shows a working link to `/account`.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: PRD update — FR-011

### Overview

Document the account-deletion requirement in the PRD so the feature has a source of truth.

### Changes Required:

#### 1. Add FR-011 to the PRD

**File**: `context/foundation/prd.md`

**Intent**: Add a functional requirement FR-011 covering account deletion (RODO Art. 17): a logged-in user can permanently delete their account and all data after explicit confirmation, is signed out, and cannot re-login. Reference the NFR account-isolation guarantee.

**Contract**: New requirement entry consistent with the existing FR formatting/numbering in `prd.md`. Prose only; no behavioral change.

### Success Criteria:

#### Automated Verification:

- Markdown formats cleanly: `npm run format` (or the repo's prettier step) leaves no further changes.

#### Manual Verification:

- `prd.md` contains FR-011 describing account deletion, consistent with the implemented behavior, in the same style as neighboring requirements.

---

## Testing Strategy

No test runner is configured (CLAUDE.md) — verification is `npm run lint`, `npm run build`, and manual testing.

### Manual Testing Steps:

1. Set `SUPABASE_SERVICE_ROLE_KEY` locally (`.env` for Node / `.dev.vars` for wrangler).
2. Sign in, create at least one flashcard, then go to `/account`.
3. Confirm the delete button is disabled until the checkbox is ticked.
4. Tick the checkbox and delete; verify redirect to `/?deleted=1` with the notice shown.
5. In Supabase, confirm the `auth.users` row and all the user's `flashcards` rows are gone.
6. Attempt to sign in with the deleted account → rejected.
7. Attempt to visit `/dashboard` → redirected to sign-in.
8. Edge: unset the secret, retry deletion → 500 "not configured", still logged in, no data removed.
9. Edge: simulate a delete failure (invalid service-role key) → inline error on `/account`, session intact.

## Performance Considerations

Negligible — a single-user delete is one admin API call plus a cascade on one small table. No load concerns.

## Migration Notes

No database migration. **Deployment:** add `SUPABASE_SERVICE_ROLE_KEY` to the production environment **by hand** (Cloudflare Worker secret), per Deployment rules — never commit it. Without it, the endpoint fails closed (500), so the feature is inert until the secret is set.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-04, lines 139-151; Question #3, line 188)
- Cascade FK: `supabase/migrations/20260528000000_create_flashcards.sql:4`
- SRS columns (not a table): `supabase/migrations/20260605000000_add_srs_fields.sql`
- Secret pattern: `astro.config.mjs:17-22`, `src/lib/supabase.ts:3`
- Session clearing pattern: `src/pages/api/auth/signout.ts`
- Protected routes: `src/middleware.ts:4`
- API conventions: `src/pages/api/flashcards/[id].ts`
- Deployment rules: `CLAUDE.md` ("Deployment rules")

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — secret, admin client & delete endpoint

#### Automated

- [x] 1.1 Type checking passes: `npm run lint` — 84e7019
- [x] 1.2 Production build succeeds: `npm run build` — 84e7019

#### Manual

- [x] 1.3 Deletion succeeds: returns `{ ok: true }`, removes `auth.users` row, cascades flashcards — 84e7019
- [x] 1.4 Re-login with deleted account is refused — 84e7019
- [x] 1.5 Missing secret → 500 "not configured", user not logged out — 84e7019
- [x] 1.6 Simulated failure keeps session intact and returns an error — 84e7019

### Phase 2: Frontend — /account page & delete flow

#### Automated

- [x] 2.1 Linting passes: `npm run lint`
- [x] 2.2 Production build succeeds: `npm run build`

#### Manual

- [x] 2.3 `/account` redirects to sign-in when logged out
- [x] 2.4 Delete button disabled until checkbox ticked
- [x] 2.5 Successful flow lands on `/` with "account deleted" notice
- [x] 2.6 Protected routes redirect to sign-in after deletion
- [x] 2.7 Failed deletion shows inline error, user stays logged in on `/account`
- [x] 2.8 Dashboard shows a working link to `/account`

### Phase 3: PRD update — FR-011

#### Automated

- [ ] 3.1 Markdown formats cleanly (`npm run format` leaves no changes)

#### Manual

- [ ] 3.2 `prd.md` contains FR-011 describing account deletion, consistent with implemented behavior
