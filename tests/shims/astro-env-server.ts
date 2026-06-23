// Vitest shim for the `astro:env/server` virtual module.
//
// `src/lib/supabase.ts` imports its config from `astro:env/server`, which only
// exists inside the Astro/Vite runtime — it is unresolvable under the plain
// `vitest/config` the integration project uses. The integration project aliases
// `astro:env/server` to this file (see vitest.config.ts) so the REAL
// `src/lib/supabase.ts` runs unchanged. Values come from `process.env`, loaded
// from `.env.test` by `tests/integration/setup.ts` before any test module.
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_KEY = process.env.SUPABASE_KEY;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
