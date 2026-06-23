// Non-handler Supabase clients for the integration tests.
//
// - adminClient(): service-role, bypasses RLS — used for setup/teardown and
//   read-back assertions that RLS can't fool. Mirrors src/lib/supabase.ts:30-37.
// - anonClient(): anon/publishable key — RLS-enforced (used by later phases).
//
// A minimal `Database` generic types `flashcards` queries (we have no generated
// types), so read-back results come back as `Flashcard` instead of `any`.
import { createClient } from "@supabase/supabase-js";
import type { Flashcard } from "@/types";

/** Project ref of the dedicated cloud test project (informational). */
export const TEST_PROJECT_REF = "kqbppawdvnjuxpvrshee";

export interface Database {
  public: {
    Tables: {
      flashcards: {
        Row: Flashcard;
        Insert: Pick<Flashcard, "front" | "back" | "user_id"> & Partial<Flashcard>;
        Update: Partial<Flashcard>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} — fill .env.test (see .env.test.example) or set it in the environment.`);
  }
  return value;
}

export function adminClient() {
  return createClient<Database>(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function anonClient() {
  return createClient<Database>(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_KEY"));
}
