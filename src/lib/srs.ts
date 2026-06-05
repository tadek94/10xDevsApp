import { createEmptyCard, fsrs, Rating, type Card } from "ts-fsrs";
import { formatDate } from "@/lib/utils";
import type { ReviewRating, SrsState } from "@/types";

// Single owner of the FSRS algorithm and the Date <-> ISO-string boundary. Date objects
// never leak past this module — callers pass/receive SrsState (ISO strings + numbers) only.

/** Shared scheduler with default FSRS weights (no optimizer package). */
export const scheduler = fsrs();

/** Maps the lowercased API rating to the ts-fsrs Rating enum. */
const RATING_MAP: Record<ReviewRating, Rating> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

/**
 * Hydrate a ts-fsrs Card from persisted SRS columns. Starts from createEmptyCard() so any
 * fields the library version adds (e.g. learning_steps) get sane defaults rather than
 * undefined, then overrides the persisted fields.
 */
function toCard(row: SrsState): Card {
  return {
    ...createEmptyCard(),
    due: new Date(row.srs_due),
    stability: row.srs_stability,
    difficulty: row.srs_difficulty,
    scheduled_days: row.srs_scheduled_days,
    reps: row.srs_reps,
    lapses: row.srs_lapses,
    state: row.srs_state,
    last_review: row.srs_last_review ? new Date(row.srs_last_review) : undefined,
  };
}

/** Serialize a ts-fsrs Card back into the SRS columns. Dates go through formatDate (UTC ISO). */
function fromCard(card: Card): SrsState {
  return {
    srs_due: formatDate(card.due),
    srs_stability: card.stability,
    srs_difficulty: card.difficulty,
    srs_scheduled_days: card.scheduled_days,
    srs_reps: card.reps,
    srs_lapses: card.lapses,
    srs_state: card.state,
    srs_last_review: card.last_review ? formatDate(card.last_review) : null,
  };
}

/**
 * Apply a review grade to a card's persisted SRS state and return the next state to persist.
 * `now` is the review timestamp.
 */
export function review(row: SrsState, rating: ReviewRating, now: Date): SrsState {
  const { card } = scheduler.next(toCard(row), now, RATING_MAP[rating]);
  return fromCard(card);
}
