import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const IdSchema = z.uuid();

const UpdateCardSchema = z.object({
  front: z.string().trim().min(1),
  back: z.string().trim().min(1),
});

export const PATCH: APIRoute = async (context) => {
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

  const parsed = UpdateCardSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  // Hydrate the session from cookies so the UPDATE carries the user JWT — the RLS policy
  // `USING (auth.uid() = user_id)` filters out other users' rows. getSession() decodes the
  // cookie locally (no Auth round-trip); the user was already validated by middleware.
  await supabase.auth.getSession();

  const { data, error } = await supabase
    .from("flashcards")
    .update({ front: parsed.data.front, back: parsed.data.back })
    .eq("id", id.data)
    .select("id, front, back, created_at");

  if (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return Response.json({ error: "Failed to update flashcard" }, { status: 500 });
  }

  // RLS filters out rows the user doesn't own, so an empty result means the card either
  // doesn't exist or belongs to another account — surface both as 404.
  if (data.length === 0) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ card: data[0] });
};

export const DELETE: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = IdSchema.safeParse(context.params.id);
  if (!id.success) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 500 });
  }

  // Hydrate the session so the DELETE carries the user JWT — RLS `USING (auth.uid() = user_id)`
  // protects against deleting another account's card.
  await supabase.auth.getSession();

  const { data, error } = await supabase.from("flashcards").delete().eq("id", id.data).select("id");

  if (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return Response.json({ error: "Failed to delete flashcard" }, { status: 500 });
  }

  if (data.length === 0) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ deleted: id.data });
};
