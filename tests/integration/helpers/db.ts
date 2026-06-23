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

/** Force a card's due date (service-role) — used to seed distinct due times for ordering tests. */
export async function setSrsDue(id: string, isoDue: string): Promise<void> {
  // Our minimal Database generic types reads well but narrows update() values to `never`
  // (no full generated types); cast the partial payload to satisfy it.
  const { error } = await adminClient()
    .from("flashcards")
    .update({ srs_due: isoDue } as never)
    .eq("id", id);
  if (error) {
    throw new Error(`setSrsDue failed: ${error.message}`);
  }
}
