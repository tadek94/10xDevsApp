import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const SaveCardsSchema = z.object({
  cards: z
    .array(
      z.object({
        front: z.string().min(1),
        back: z.string().min(1),
      }),
    )
    .min(1)
    .max(15),
});

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SaveCardsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { cards } = parsed.data;
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  // Load session into client so DB calls include the user JWT (same pattern as middleware)
  await supabase.auth.getUser();

  const rows = cards.map((card) => ({
    front: card.front,
    back: card.back,
    user_id: user.id,
  }));

  const { data, error } = await supabase.from("flashcards").insert(rows).select("id");

  if (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return Response.json({ error: "Failed to save flashcards" }, { status: 500 });
  }

  return Response.json({ saved: data.length });
};
