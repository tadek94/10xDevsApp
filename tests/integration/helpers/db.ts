// Read-back helpers: read rows straight from the DB via the service-role client
// (bypassing RLS) so persistence assertions can't be fooled by the handler's own
// auth context.
import type { Flashcard } from "@/types";
import { adminClient } from "./clients";

export async function readFlashcard(id: string): Promise<Flashcard | null> {
  const { data, error } = await adminClient().from("flashcards").select("*").eq("id", id).maybeSingle();
  if (error) {
    throw new Error(`readFlashcard failed: ${error.message}`);
  }
  return data;
}

export async function readFlashcardsByUser(userId: string): Promise<Flashcard[]> {
  const { data, error } = await adminClient().from("flashcards").select("*").eq("user_id", userId);
  if (error) {
    throw new Error(`readFlashcardsByUser failed: ${error.message}`);
  }
  return data;
}
