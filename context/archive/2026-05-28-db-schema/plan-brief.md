# Flashcard Schema and RLS Migration — Plan Brief

> Full plan: `context/changes/db-schema/plan.md`

## What & Why

Create the `flashcards` table in Supabase (F-01 from the roadmap). This is the data foundation the entire MVP depends on — without it, no slice can save, retrieve, or review cards. The table must have per-user Row Level Security from day one, as required by the PRD NFR: "no cross-account data leakage under any request path."

## Starting Point

`supabase/migrations/` is empty; `src/types.ts` does not exist. Supabase CLI v2.23.4 is available. The auth layer is fully wired — user ID is accessible as `context.locals.user.id` (UUID), which is what RLS policies will reference via `auth.uid()`.

## Desired End State

The remote Supabase dev project has a `flashcards` table with UUID PK, user ownership, front/back text fields, UTC timestamps, an auto-updating `updated_at` trigger, RLS enabled, and four per-operation policies (SELECT/INSERT/UPDATE/DELETE). `src/types.ts` exports `Flashcard`, `FlashcardInsert`, and `FlashcardUpdate`. Future slices (S-01, S-02, S-03) import from `src/types.ts` and push to the same Supabase project.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Primary key type | UUID (gen_random_uuid()) | Consistent with auth.users id type; safe for export/merge operations | Plan |
| TypeScript types | Manual in src/types.ts | Works without a running Supabase instance; no extra npm scripts needed for MVP | Plan |
| Verification target | Remote Supabase dev project | No Docker available locally; `supabase db push` is the deployment path anyway | Plan |
| Schema scope | Minimal (6 fields only) | SRS fields depend on library choice (FR-010, still unresolved); easy to add later via migration | Roadmap |
| RLS granularity | Per-operation (4 policies) | CLAUDE.md convention; UPDATE requires split USING+WITH CHECK to prevent user_id reassignment | Plan |

## Scope

**In scope:** `flashcards` table, `updated_at` trigger, RLS + 4 policies, `src/types.ts` with 3 types, remote push + dashboard verification.

**Out of scope:** SRS fields, seed data, `supabase gen types` script, local Docker setup, position/ordering field.

## Architecture / Approach

Single SQL migration file → `supabase db push` → remote dev. TypeScript types hand-written to mirror schema exactly. The `update_updated_at_column()` trigger function is defined at the DB level (reusable for future tables). All four RLS policies reference `auth.uid()` — the Supabase built-in for the current authenticated user's UUID.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. SQL Migration | `supabase/migrations/20260528000000_create_flashcards.sql` with table + trigger + RLS | UPDATE policy needs both USING and WITH CHECK — easy to write only one |
| 2. TypeScript Types | `src/types.ts` with Flashcard, FlashcardInsert, FlashcardUpdate | Type shape diverges from schema if fields change |
| 3. Push and Verify | Migration applied to remote dev; dashboard confirms schema + policies | `supabase link` requires project-ref from dashboard URL |

**Prerequisites:** Supabase account, project-ref for the dev project (visible in dashboard URL), `npx supabase login` completed.

**Estimated effort:** ~1 session, 3 short phases. Phase 1 and 2 are write-only; Phase 3 is the only network operation.

## Open Risks & Assumptions

- `supabase db push` assumes the project is already linked (`supabase link --project-ref`). If not linked, the push will fail with a clear error — run `npx supabase link` first.
- SRS scheduling fields (interval, ease_factor, due_date) are intentionally absent. They will be added as a separate migration in S-03 once the SRS library is chosen (Open Roadmap Question #2).

## Success Criteria (Summary)

- `npx supabase db push` exits 0 and reports 1 migration applied
- Supabase dashboard shows `flashcards` table with RLS badge and 4 policies
- `npm run lint` and `npm run build` pass with the new `src/types.ts`
