# Account Deletion (RODO Art. 17) — Plan Brief

> Full plan: `context/changes/account-deletion/plan.md`

## What & Why

Let a logged-in user permanently delete their own account and all data after an explicit confirmation, then sign them out and block re-login. Realizes RODO Art. 17 ("right to be forgotten", proposed FR-011) and closes the account lifecycle opened by account creation (FR-001).

## Starting Point

Auth is in place (cookie-bound SSR client, middleware-resolved `locals.user`, signin/signout). `flashcards` is the only user-owned table and already has `ON DELETE CASCADE` on `auth.users` — SRS/review history are columns on it, not a separate table. The only gap: the anon-key SSR client can't call `auth.admin.deleteUser`.

## Desired End State

From a new `/account` page, the user ticks "I understand this is permanent" (which enables the delete button), clicks delete, and the server deletes their `auth.users` row via an admin client. The cascade wipes their flashcards, the session is cleared, and they land on `/` with an "account deleted" notice. Re-login is refused; no path returns their data. On server failure, the session is kept and an error shown.

## Key Decisions Made

| Decision                         | Choice                                            | Why (1 sentence)                                                              | Source   |
| -------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- | -------- |
| Deletion mechanism               | Admin client + `SUPABASE_SERVICE_ROLE_KEY`        | Officially supported `auth.admin.deleteUser`; no custom SQL on the auth schema. | Roadmap/Plan |
| Hard vs soft delete              | Hard delete + cascade                             | RODO "without undue delay"; data provably gone, no purge job needed.          | Roadmap/Plan |
| Confirmation UX                  | Checkbox + confirm button                         | Deliberate action without typing friction (user's call).                      | Plan     |
| Entry point placement            | Dedicated `/account` page                         | Keeps a destructive action off the dashboard; room to grow.                   | Plan     |
| Failure handling                 | Keep session, show error, stay logged in          | Account is either fully gone or fully intact — no half-deleted limbo.         | Plan     |
| Post-deletion redirect           | `/` with `?deleted=1` confirmation notice         | Clear closure; reuses existing signout→`/` pattern.                           | Plan     |
| PRD update                       | Add FR-011 in this change                         | Keeps docs in sync with shipped behavior.                                     | Plan     |

## Scope

**In scope:** service-role secret config; server-only admin client; `POST /api/account/delete`; protected `/account` page; checkbox-gated React delete island; dashboard link; homepage "deleted" notice; PRD FR-011.

**Out of scope:** soft delete / grace period / purge job; schema or migration changes; admin-facing (other-user) deletion; email/re-auth confirmation step; audit log; automated tests.

## Architecture / Approach

A new server-only `createAdminClient()` (service-role key, no session) sits beside the existing cookie-bound `createClient`. The endpoint deletes `locals.user.id` *only* (never a body-supplied id): delete first via the admin client, then — only on success — clear the session via the SSR client's `signOut()`. The cascade handles all data. The React island POSTs and redirects client-side on success. Missing secret ⇒ fail closed (500), feature inert until the secret is set in prod by hand.

## Phases at a Glance

| Phase                                          | What it delivers                                            | Key risk                                                        |
| ---------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| 1. Backend — secret, admin client & endpoint   | Working self-service delete via admin client + cascade      | Full-privilege secret handling; must delete *self* only.       |
| 2. Frontend — /account page & delete flow       | Protected page, checkbox-gated island, link, deleted notice | Confirmation friction vs. accidental deletion; redirect timing. |
| 3. PRD update — FR-011                          | Documented requirement                                      | Low — doc-only.                                                |

**Prerequisites:** F-01 (cascade — already present) and existing auth. To run end-to-end locally, `SUPABASE_SERVICE_ROLE_KEY` must be set.
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- The new service-role key is full-privilege: env-var only, never committed, added to production by hand (Deployment rules).
- Cascade completeness depends on every future user-owned table also using `ON DELETE CASCADE`; today only `flashcards` exists.
- Deletion is irreversible by design — no recovery path.

## Success Criteria (Summary)

- A confirmed user can delete their account; afterward re-login is refused and their flashcards are gone from the DB.
- A server-side failure leaves the account intact and the user logged in (no half-deleted state).
- After deletion the user sees a clear confirmation on the homepage.
