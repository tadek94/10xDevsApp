export interface Flashcard {
  id: string;
  user_id: string;
  front: string;
  back: string;
  created_at: string;
  updated_at: string;
}

export type FlashcardInsert = Pick<Flashcard, "front" | "back">;

export type FlashcardUpdate = Partial<Pick<Flashcard, "front" | "back">>;
