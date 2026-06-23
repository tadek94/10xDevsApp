// Auth + isolation fixtures for DB-touching integration tests.
//
// The handlers split authz (locals.user → 401 gate) from data access (the
// RLS identity comes from the JWT in the request's Cookie header, hydrated by
// getSession()). So a test must supply a REAL authenticated cookie, not just
// locals.user. We obtain that cookie by signing in through a cookie-capturing
// createServerClient (reusing @supabase/ssr's own cookie format) rather than
// hand-rolling the base64/chunked sb-<ref>-auth-token value.
import { createServerClient } from "@supabase/ssr";
import type { APIContext } from "astro";
import { adminClient, requireEnv } from "./clients";

export interface TestUser {
  id: string;
  email: string;
  password: string;
  /** Captured auth cookie, populated lazily on first authedContext() — reused across the
   *  user's requests so we sign in once per user (not once per request → avoids GoTrue rate limits). */
  cookieHeader?: string;
}

/** Create an isolated, pre-confirmed user (unique email → parallel-safe). */
export async function createTestUser(): Promise<TestUser> {
  const email = `test+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = `Pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    throw new Error(`createTestUser failed: ${error.message}`);
  }
  return { id: data.user.id, email, password };
}

/** Delete a test user; the FK ON DELETE CASCADE removes their flashcards. */
export async function deleteTestUser(id: string): Promise<void> {
  const { error } = await adminClient().auth.admin.deleteUser(id);
  if (error) {
    throw new Error(`deleteTestUser failed: ${error.message}`);
  }
}

async function captureCookieHeader(email: string, password: string): Promise<string> {
  const jar: Record<string, string> = {};
  const client = createServerClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_KEY"), {
    cookies: {
      getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) {
          jar[name] = value;
        }
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`sign-in failed for ${email}: ${error.message}`);
  }
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

export interface RequestSpec {
  url: string;
  method: string;
  body?: unknown;
  params?: Record<string, string>;
}

/**
 * Build a fake APIContext carrying a real authenticated session: the captured
 * sb-<ref>-auth-token cookie rides on request.headers, and a minimal cookies
 * stub satisfies the client's setAll. Pass to a handler as `POST(context)`.
 */
export async function authedContext(user: TestUser, spec: RequestSpec): Promise<APIContext> {
  user.cookieHeader ??= await captureCookieHeader(user.email, user.password);
  const headers: Record<string, string> = { Cookie: user.cookieHeader };
  let body: string | undefined;
  if (spec.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(spec.body);
  }
  const request = new Request(spec.url, { method: spec.method, headers, body });
  const cookies = {
    get: () => undefined,
    getAll: () => [],
    has: () => false,
    set: () => undefined,
    delete: () => undefined,
  };
  return {
    locals: { user: { id: user.id } },
    request,
    cookies,
    params: spec.params ?? {},
  } as unknown as APIContext;
}
