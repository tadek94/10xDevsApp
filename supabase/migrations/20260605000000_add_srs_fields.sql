-- S-03: SRS (spaced repetition) state for flashcards.
-- Extends the existing flashcards table with ts-fsrs Card fields. Column defaults mirror
-- ts-fsrs createEmptyCard() (a brand-new "New" card), so existing rows backfill into valid,
-- immediately-due cards without a separate UPDATE.
--
-- No new RLS policies and no new GRANT: the existing per-operation policies and the
-- table-level GRANT (20260601000000_grant_flashcards_permissions.sql) already cover every
-- column of this table — they filter by user_id, not by column.

ALTER TABLE flashcards
  ADD COLUMN srs_due            TIMESTAMPTZ      NOT NULL DEFAULT timezone('utc', now()),
  ADD COLUMN srs_stability      DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN srs_difficulty     DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN srs_elapsed_days   INTEGER          NOT NULL DEFAULT 0,
  ADD COLUMN srs_scheduled_days INTEGER          NOT NULL DEFAULT 0,
  ADD COLUMN srs_reps           INTEGER          NOT NULL DEFAULT 0,
  ADD COLUMN srs_lapses         INTEGER          NOT NULL DEFAULT 0,
  ADD COLUMN srs_state          SMALLINT         NOT NULL DEFAULT 0 CHECK (srs_state BETWEEN 0 AND 3),
  ADD COLUMN srs_last_review    TIMESTAMPTZ;

-- Supports the review-session query: fetch a user's due cards ordered by srs_due.
CREATE INDEX idx_flashcards_user_due ON flashcards (user_id, srs_due);
