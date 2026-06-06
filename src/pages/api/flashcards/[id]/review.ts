import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { review } from "@/lib/srs";

export const prerender = false;

const IdSchema = z.uuid();

const ReviewSchema = z.object({
  rating: z.enum(["again", "hard", "good", "easy"]),
});

// Columns that make up the persisted SRS state (SrsState) — excludes the deprecated
// srs_elapsed_days, which ts-fsrs recomputes from last_review.
const SRS_COLUMNS =
  "srs_due, srs_stability, srs_difficulty, srs_scheduled_days, srs_reps, srs_lapses, srs_state, srs_last_review";

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = IdSchema.safeParse(context.params.id);
  if (!id.success) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ReviewSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  // Hydrate the session so both the SELECT and UPDATE carry the user JWT — RLS
  // `USING (auth.uid() = user_id)` filters out other users' rows.
  await supabase.auth.getSession();

  // Load the card's current SRS state. RLS scopes this to the owner, so an empty result
  // means the card doesn't exist or belongs to another account — surface both as 404.
  const { data: rows, error: selectError } = await supabase.from("flashcards").select(SRS_COLUMNS).eq("id", id.data);

  if (selectError) {
    // eslint-disable-next-line no-console
    console.error(selectError);
    return Response.json({ error: "Failed to load flashcard" }, { status: 500 });
  }

  if (rows.length === 0) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const next = review(rows[0], parsed.data.rating, new Date());

  // Optimistic concurrency guard: srs_reps increases monotonically on every review,
  // so matching the value we just read serializes concurrent reviews of the same card
  // (the read-modify-write between SELECT and UPDATE is otherwise non-atomic).
  const { data, error } = await supabase
    .from("flashcards")
    .update(next)
    .eq("id", id.data)
    .eq("srs_reps", rows[0].srs_reps)
    .select("id, front, back, srs_due");

  if (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return Response.json({ error: "Failed to save review" }, { status: 500 });
  }

  if (data.length === 0) {
    // The card existed at SELECT (we passed the 404 above), so an empty UPDATE means a
    // concurrent review bumped srs_reps first — surface as a conflict so the client retries.
    return Response.json({ error: "Conflict — card was reviewed concurrently" }, { status: 409 });
  }

  return Response.json({ card: data[0] });
};
