import type { APIRoute } from "astro";
import { createClient, createAdminClient } from "@/lib/supabase";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return Response.json({ error: "Account deletion is not configured" }, { status: 500 });
  }

  // Target is always the authenticated caller — never a client-supplied id. Deleting the
  // auth.users row cascades to the user's flashcards (ON DELETE CASCADE).
  const { error } = await admin.auth.admin.deleteUser(user.id);

  if (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    // Do NOT sign out on failure: the account must be either fully gone or fully intact.
    return Response.json({ error: "Failed to delete account" }, { status: 500 });
  }

  // Deletion succeeded — clear the session cookies via the cookie-bound client so the
  // response carries the session-clearing Set-Cookie headers. Best-effort: the account is
  // already gone, so a signOut failure must not surface as a misleading "delete failed".
  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (signOutError) {
      // eslint-disable-next-line no-console
      console.error(signOutError);
    }
  }

  return Response.json({ ok: true });
};
