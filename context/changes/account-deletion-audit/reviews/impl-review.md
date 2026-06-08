# Implementation Review — account-deletion (S-04), retroactive

> **Why retroactive:** S-04 (`context/archive/2026-06-06-account-deletion/`) was merged to `main` and archived without an `/10x-impl-review` step. The archive is immutable (`CLAUDE.md`), so this review lives in a separate audit change and reviews the **merged code on `main`** against the archived `plan.md`.
> Reviewed: 2026-06-08. Commits referenced by plan Progress: `84e7019` (Phase 1), `73eb0d5` (Phase 2), `391c82f` (Phase 3).

## Scope reviewed

- `src/lib/supabase.ts` — `createAdminClient()`
- `src/pages/api/account/delete.ts` — deletion endpoint
- `src/components/DeleteAccountForm.tsx` — confirmation island
- `src/pages/account.astro` — account page
- `src/pages/index.astro` — post-deletion notice
- `src/middleware.ts` — protected route registration
- `astro.config.mjs` — env schema
- `.env.example` / `.dev.vars.example` — secret documentation
- `context/foundation/prd.md` — FR-011

## Verdict

**Ship-sound.** No critical or blocking defects. The implementation follows the plan faithfully on the load-bearing security properties:

- ✅ **Self-deletion only** — target is `context.locals.user.id`; no client-supplied id path (`delete.ts:7,19`).
- ✅ **Fail-closed on missing secret** — `createAdminClient()` returns `null`, endpoint returns 500 "not configured", no anon fallback (`supabase.ts:31`, `delete.ts:12-15`).
- ✅ **Delete-then-signout ordering** — signOut only runs after a successful delete; on delete error it returns 500 **without** signing out (`delete.ts:19-33`).
- ✅ **Admin client is server-only** — plain `createClient` with `persistSession:false, autoRefreshToken:false`, documented "NEVER import into client code" (`supabase.ts:30-37`).
- ✅ **Secret not leaked** — tracked files contain only the key *name*; values are `###` placeholders (`.env.example`, `astro.config.mjs`). No migration (cascade pre-existed). FR-011 present in PRD. `/account` registered in `PROTECTED_ROUTES`.

## Findings

### F1 — `.dev.vars.example` missing `SUPABASE_SERVICE_ROLE_KEY` (drift vs plan)  · severity: low (DX)

Plan Phase 1 #2 says to add the key name to "whichever is tracked". `.env.example` got it, but **`.dev.vars.example` did not** — and per `CLAUDE.md` local wrangler dev reads `.dev.vars`, not `.env`. A developer running `wrangler dev` has no signal the variable exists; account deletion then silently fails-closed (500 "not configured") locally with no obvious cause.

**Fix:** add the key (placeholder + comment) to `.dev.vars.example`, mirroring `.env.example`. — **applied in this change.**

### F2 — `signOut()` after successful delete is unguarded  · severity: low

`delete.ts:32` does `await supabase.auth.signOut()` outside any try/catch, *after* the account is already deleted. If `signOut()` throws (network error, or the now-deleted session erroring on a global-scope revoke), the endpoint throws → 500 → the island shows "failed to delete account" — but the account **is** actually deleted. This is the inverse of the limbo the plan explicitly set out to avoid: the user sees failure for an operation that succeeded.

Worst-case impact is benign (deleted user → `getUser()` returns null on the next request, so they're effectively logged out regardless of stale cookies), but the misleading 500 is avoidable.

**Fix:** wrap the post-delete `signOut()` in try/catch; once `deleteUser` succeeds, always return `{ ok: true }` (best-effort cookie clear). — **applied in this change.**

### F3 — No explicit same-origin/CSRF assertion on a destructive POST  · severity: low (verify)

`/api/account/delete` performs an irreversible action keyed only on the session cookie, with no body and no explicit Origin check in the handler. In practice this is **likely already mitigated** by (a) Supabase `@supabase/ssr` cookies defaulting to `SameSite=Lax`, which blocks cookies on cross-site POST, and (b) Astro's `security.checkOrigin` (default on for on-demand routes). Not changed here — flagged for confirmation rather than a blind code change.

**Recommendation (not applied):** confirm the auth cookie's `SameSite` attribute in a prod response; if anything other than `Lax`/`Strict`, add an explicit `Origin`/`Sec-Fetch-Site` check to the endpoint.

## Non-issues considered

- **Checkbox vs. type-to-confirm** — weaker than FR-008's pattern, but plan §"What We're NOT Doing" explicitly chose the checkbox. Not drift.
- **`console.error(error)` logs full error** — server-side log only; acceptable.
- **No rate limiting** — irrelevant for a self-scoped destructive action.

## Actions taken in this change

- F1 fixed: `SUPABASE_SERVICE_ROLE_KEY` added to `.dev.vars.example`.
- F2 fixed: post-delete `signOut()` wrapped; endpoint returns `{ ok: true }` once deletion succeeds.
- F3: left as a documented verification item (no code change).

## Verification (2026-06-08)

- `npm run lint` — ✅ clean.
  - Note: a first run errored on `supabase.ts:34` (`no-unsafe-argument`) because the generated `astro:env/server` types were stale (didn't yet include `SUPABASE_SERVICE_ROLE_KEY`, so the import resolved to `any`). `npx astro sync` regenerated the types and lint passed. **Lesson:** after editing `env.schema` in `astro.config.mjs`, run `astro sync` (or a build) before `lint`, or `lint` may report phantom unsafe-typing errors.
- `npm run build` — ✅ succeeds (only the pre-existing sitemap `site`-missing warning, unrelated).
</content>
