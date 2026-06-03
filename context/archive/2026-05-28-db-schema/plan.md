# Flashcard Schema and RLS Migration — Implementation Plan

## Overview

Create the `flashcards` table in Supabase with per-user Row Level Security, an auto-updating `updated_at` trigger, and matching TypeScript types in `src/types.ts`. This is F-01 from the roadmap — the data foundation that unlocks S-01 (AI generation), S-02 (collection management), and S-03 (SRS session).

## Current State Analysis

- `supabase/migrations/` is empty — this is the first migration in the project.
- `supabase/config.toml` has migrations enabled but `schema_paths = []`; seed.sql does not exist.
- Supabase CLI v2.23.4 is available in devDependencies (`package.json:52`).
- `src/types.ts` does not exist.
- `src/env.d.ts` declares `App.Locals.user` as Supabase `User | null`; user ID accessible as `context.locals.user.id` (UUID).
- No existing `auth.uid()` usage in the codebase — this migration introduces the pattern.

## Desired End State

A `flashcards` table exists in the remote Supabase project with RLS enabled and four per-operation policies ensuring users can only access their own cards. `src/types.ts` exports `Flashcard`, `FlashcardInsert`, and `FlashcardUpdate` types aligned with the schema. The migration is version-controlled; any future developer (or agent) can apply it with `npx supabase db push`.

### Key Discoveries

- User ID type in auth.users is UUID — `user_id` column must be `UUID` + `REFERENCES auth.users(id)` to enable `auth.uid()` comparison in RLS policies.
- CLAUDE.md requires UTC dates — all timestamp defaults must use `timezone('utc', now())`, not bare `now()`.
- CLAUDE.md requires per-operation RLS policies — one policy per operation (SELECT, INSERT, UPDATE, DELETE), not a single permissive policy.

## What We're NOT Doing

- SRS scheduling fields (`interval`, `ease_factor`, `due_date`) — deferred to S-03 per roadmap.
- `position` field for manual card ordering — not in PRD scope.
- `npx supabase gen types` npm script — manual types are sufficient for now; can be added in S-01.
- Local Supabase setup (Docker) — verification uses the remote dev project.
- seed.sql / sample data.

## Implementation Approach

Single migration file captures the full schema in one atomic change (table + trigger + RLS). TypeScript types are hand-written to mirror the schema — no CLI generation dependency. Verification pushes directly to the remote Supabase dev project and confirms visually via the dashboard.

## Critical Implementation Details

**UPDATE policy requires both USING and WITH CHECK.** For SELECT and DELETE, only `USING` applies. For INSERT, only `WITH CHECK` applies. For UPDATE, both are required — `USING` filters which rows the user can target, `WITH CHECK` prevents changing `user_id` to another user's ID. Omitting either clause on UPDATE creates a security gap.

**`updated_at` needs a BEFORE UPDATE trigger.** A column DEFAULT only fires on INSERT. Without the trigger, `updated_at` never changes after creation — violating the guardrail in PRD that edits must persist reliably (a stale timestamp would confuse any future "last modified" display).

---

## Phase 1: SQL Migration

### Overview

Creates the migration file that defines the `flashcards` table, the `updated_at` auto-update trigger, enables RLS, and installs four per-operation policies.

### Changes Required

#### 1. Migration file

**File:** `supabase/migrations/20260528000000_create_flashcards.sql`

**Intent:** Define the flashcards table with UUID PK, user ownership, text fields for card content, UTC timestamps, an auto-update trigger, RLS enabled, and four per-operation policies restricting all operations to the owning user.

**Contract:** New file. Full SQL — included here because the UPDATE policy split (USING + WITH CHECK) and the trigger pattern are non-obvious and the rest of the roadmap depends on getting this right:

```sql
-- Table
CREATE TABLE flashcards (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  front      TEXT        NOT NULL,
  back       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_flashcards_updated_at
  BEFORE UPDATE ON flashcards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own flashcards"
  ON flashcards FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own flashcards"
  ON flashcards FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own flashcards"
  ON flashcards FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own flashcards"
  ON flashcards FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
```

### Success Criteria

#### Automated Verification

- Migration file exists at `supabase/migrations/20260528000000_create_flashcards.sql`
- `npm run lint` passes with no errors

#### Manual Verification

- File opens correctly in editor; SQL syntax looks valid before pushing

**Implementation Note:** Pause here after creating the file and doing a quick visual review before proceeding to Phase 2.

---

## Phase 2: TypeScript Types

### Overview

Creates `src/types.ts` with three exported types that other slices will import when working with flashcard data.

### Changes Required

#### 1. src/types.ts (new file)

**File:** `src/types.ts`

**Intent:** Export `Flashcard` (full DB row shape), `FlashcardInsert` (only user-supplied fields on creation), and `FlashcardUpdate` (partial fields allowed on edit). These types are the TypeScript contract for all flashcard data operations across S-01, S-02, and S-03.

**Contract:** New file. `Flashcard` mirrors the DB schema exactly (all six columns as their TypeScript equivalents). `FlashcardInsert` is `Pick<Flashcard, 'front' | 'back'>` — only the two fields a user provides; `id`, `user_id`, and timestamps are set by the DB. `FlashcardUpdate` is `Partial<Pick<Flashcard, 'front' | 'back'>>` — allows updating either or both text fields.

### Success Criteria

#### Automated Verification

- `npm run lint` passes (type definitions are valid TypeScript)
- `npm run build` passes (no import resolution errors)

#### Manual Verification

- `src/types.ts` exports are importable without errors in a test import

---

## Phase 3: Push and Verify

### Overview

Pushes the migration to the remote Supabase dev project and confirms the schema, RLS, and policies are live.

### Changes Required

#### 1. Link and push

**File:** No file changes — operational step.

**Intent:** Apply the migration to the remote Supabase project so the table exists for all subsequent slice implementations.

**Contract:** Run in order:
1. `npx supabase login` — authenticate (skip if already logged in)
2. `npx supabase link --project-ref <your-project-ref>` — link to the dev project (skip if already linked; project ref visible in Supabase dashboard URL)
3. `npx supabase db push` — apply all pending migrations

### Success Criteria

#### Automated Verification

- `npx supabase db push` exits with code 0 and reports 1 migration applied

#### Manual Verification

- Supabase dashboard → Table Editor: `flashcards` table is visible with correct columns
- Supabase dashboard → Authentication → Policies: 4 policies listed under `flashcards`
- RLS badge is shown on the `flashcards` table (indicates RLS is enabled)
- Attempting to query `flashcards` without auth returns 0 rows (not an error — RLS blocks access, returns empty)

---

## Testing Strategy

### Manual Testing Steps

1. In Supabase dashboard SQL editor, run `SELECT * FROM flashcards;` as `anon` role — expect 0 rows (RLS blocks).
2. Insert a row directly as a service role and verify it's visible only when querying as the matching `authenticated` user (via dashboard's impersonation or via app after S-01 ships).
3. Run `npm run lint` and `npm run build` locally — both must pass with the new `src/types.ts`.

## Migration Notes

This migration introduces the first row in `supabase/migrations/`. Future migrations (SRS scheduling fields in S-03) will be separate files with later timestamps — no changes to this file needed.

## References

- Roadmap item: `context/foundation/roadmap.md` § F-01
- CLAUDE.md conventions: migration naming, RLS requirement, UTC dates
- Supabase RLS docs: per-operation policy syntax

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: SQL Migration

#### Automated

- [x] 1.1 Migration file exists at `supabase/migrations/20260528000000_create_flashcards.sql` — 8d21e10
- [x] 1.2 `npm run lint` passes with no errors — 8d21e10

#### Manual

- [x] 1.3 SQL file visually reviewed before pushing — 8d21e10

### Phase 2: TypeScript Types

#### Automated

- [x] 2.1 `npm run lint` passes — 65cb62c
- [x] 2.2 `npm run build` passes — 65cb62c

#### Manual

- [x] 2.3 `src/types.ts` exports importable without errors — 65cb62c

### Phase 3: Push and Verify

#### Automated

- [x] 3.1 `npx supabase db push` exits 0, reports 1 migration applied — 3a466c6

#### Manual

- [x] 3.2 `flashcards` table visible in Supabase dashboard with correct columns — 3a466c6
- [x] 3.3 4 RLS policies listed under `flashcards` in Authentication → Policies — 3a466c6
- [x] 3.4 RLS badge shown on `flashcards` table — 3a466c6
