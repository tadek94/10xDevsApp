import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { formatDate } from "@/lib/utils";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  // Hydrate the session so the SELECT carries the user JWT — the RLS policy
  // `USING (auth.uid() = user_id)` returns only this user's cards.
  await supabase.auth.getSession();

  // Due cards in SRS order: srs_due <= now, ascending. formatDate() keeps the UTC-string rule.
  const { data, error } = await supabase
    .from("flashcards")
    .select("id, front, back")
    .lte("srs_due", formatDate(new Date()))
    .order("srs_due", { ascending: true });

  if (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return Response.json({ error: "Failed to load due cards" }, { status: 500 });
  }

  return Response.json({ cards: data });
};
