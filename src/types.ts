export interface Flashcard {
  id: string;
  user_id: string;
  front: string;
  back: string;
  created_at: string;
  updated_at: string;
  // SRS (ts-fsrs Card) state. Timestamps are ISO strings (TIMESTAMPTZ); the rest are numeric
  // FSRS fields. srs_state: 0=New, 1=Learning, 2=Review, 3=Relearning.
  srs_due: string;
  srs_stability: number;
  srs_difficulty: number;
  srs_elapsed_days: number;
  srs_scheduled_days: number;
  srs_reps: number;
  srs_lapses: number;
  srs_state: number;
  srs_last_review: string | null;
}

export type FlashcardInsert = Pick<Flashcard, "front" | "back">;

export type FlashcardUpdate = Partial<Pick<Flashcard, "front" | "back">>;

/** The four FSRS grades, lowercased for the review API contract. */
export type ReviewRating = "again" | "hard" | "good" | "easy";

/** Lightweight card shape sent to the review UI — no SRS fields, no Date objects leak out. */
export type ReviewCard = Pick<Flashcard, "id" | "front" | "back">;

/** The SRS column subset persisted by the review flow. */
export type SrsState = Pick<
  Flashcard,
  | "srs_due"
  | "srs_stability"
  | "srs_difficulty"
  | "srs_elapsed_days"
  | "srs_scheduled_days"
  | "srs_reps"
  | "srs_lapses"
  | "srs_state"
  | "srs_last_review"
>;
