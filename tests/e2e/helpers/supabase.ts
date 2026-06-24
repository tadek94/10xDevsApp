// Service-role helper for E2E setup/teardown against the cloud TEST project.
// Keys come from process.env (loaded from .env.test by playwright.config.ts).
// Used only to create a pre-confirmed test user and to delete it afterwards
// (FK ON DELETE CASCADE removes that user's flashcards) — never inside the
// browser flow under test.
import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} — playwright.config.ts should load it from .env.test.`);
  }
  return value;
}

function adminClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface E2EUser {
  id: string;
  email: string;
  password: string;
}

/** Create an isolated, pre-confirmed user (unique email → parallel/re-run safe). */
export async function createE2EUser(): Promise<E2EUser> {
  const email = `e2e+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = `Pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const { data, error } = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    throw new Error(`createE2EUser failed: ${error.message}`);
  }
  return { id: data.user.id, email, password };
}

/** Delete the user; the FK cascade removes their flashcards. */
export async function deleteE2EUser(id: string): Promise<void> {
  const { error } = await adminClient().auth.admin.deleteUser(id);
  if (error) {
    throw new Error(`deleteE2EUser failed: ${error.message}`);
  }
}
