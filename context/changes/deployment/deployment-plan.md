# Cloudflare Pages — First Deploy Plan

## Context

The project (10xCards) is an Astro 6 SSR app with the `@astrojs/cloudflare` adapter already installed
and configured. `wrangler.jsonc` already has `nodejs_compat` and a recent `compatibility_date`.

**Deploy mechanism:** Cloudflare Pages Git integration — Cloudflare installs a GitHub App that watches
the repo directly and auto-deploys on every push to the configured production branch. GitHub Actions
plays no part in deploying; it only runs lint + build as a quality gate. These two systems are
completely independent: a failing CI job does not block a Cloudflare deploy, and a Cloudflare build
failure does not affect CI.

**What was found during exploration:**
- `wrangler.jsonc` — `compatibility_date: "2026-05-08"`, `nodejs_compat` flag present, project name `"10x-astro-starter"` ← needs renaming to match Pages project name
- `astro.config.mjs` — `@astrojs/cloudflare` adapter, `SUPABASE_URL`/`SUPABASE_KEY` as `astro:env/server` secrets
- `@supabase/ssr` v0.10.3 — uses `cookies.set()` via Astro's API (safe pattern; avoids the immutable-Response issue)
- `.github/workflows/ci.yml` — targets `master` branch, but repo default is `main` — CI never fires on pushes to `main`
- No `.dev.vars` file — needed before `wrangler dev` reads secrets locally
- No `OPENROUTER_API_KEY` in `.env.example` or `astro.config.mjs` schema — needs adding before AI routes can read it
- **CPU limit updated (Mar 2025):** Workers Paid plan now allows up to 5 min CPU (300 000 ms), not 30 s as the infra doc states

---

## Phase 0 — Prerequisites

> These steps must be complete before any local config work or dashboard setup. Both CLI tools need to be authenticated; Supabase must have an active project with credentials in hand.

### 0A — Wrangler CLI (Cloudflare)

- [ ] **0A.1 — Install Wrangler**
  - Run: `npm install -g wrangler@latest`
  - Verify: `wrangler --version` — must print `3.x` or higher
  - If a project-local Wrangler is preferred, install as a dev dependency instead: `npm install -D wrangler@latest` and prefix all commands with `npx`

- [ ] **0A.2 — Authenticate with Cloudflare**
  - Run: `wrangler login`
  - A browser window opens for Cloudflare OAuth — log in with the account that will own the Pages project
  - Verify: `wrangler whoami` — prints the authenticated account email and account ID
  - Credentials are stored at `~/.wrangler/config/default.toml` (never commit this file)

  **Edge case — corporate network blocks OAuth redirect:**
  - Run `wrangler login --browser=false` to get a URL you can open manually
  - Complete the OAuth flow and paste the resulting token back into the terminal

- [ ] **0A.3 — Confirm account ID**
  - The account ID printed by `wrangler whoami` is needed when creating the Pages project in the dashboard (Phase 2.1)
  - Note it down — it avoids searching later

---

### 0B — Supabase Project

- [ ] **0B.1 — Create a Supabase account (if not done)**
  - Go to `https://supabase.com` → Sign Up
  - Free plan covers the MVP: up to 500 MB database, 50k monthly active users, 5 GB egress

- [ ] **0B.2 — Create a new project**
  - Supabase Dashboard → New project
  - Project name: `10xcards` (or any name — this is display-only, not used in code)
  - Database password: generate a strong one and save it in a password manager — it is needed for direct Postgres access and cannot be recovered
  - Region: pick the region closest to the majority of users (EU Central for Poland-focused traffic)
  - Wait for provisioning (~2 minutes)

- [ ] **0B.3 — Retrieve Project URL and anon key**
  - Supabase Dashboard → Project → Settings → API
  - **Project URL**: `https://<ref>.supabase.co` — this is `SUPABASE_URL`
  - **Project API Keys → `anon` `public`**: this is `SUPABASE_KEY`
  - Copy both values — they are needed in Phase 1.3 (`.dev.vars`), Phase 2.2 (Cloudflare dashboard), and Phase 2.3 (GitHub Actions secrets)

  **Why `anon`, not `service_role`:** The `anon` key is intended for client-facing code and is gated by Row Level Security policies. The `service_role` key bypasses RLS and must never be exposed in front-end or SSR code. Only use `service_role` in trusted server-side scripts (migrations, admin scripts) that run outside the request path.

- [ ] **0B.4 — Enable Email auth provider**
  - Supabase Dashboard → Authentication → Providers → Email → Enable
  - Confirm Email is recommended for production (disabling it allows sign-up without verification)
  - For MVP with low-risk users, disabling "Confirm email" speeds up testing — re-enable before public launch

- [ ] **0B.5 — Install Supabase CLI (optional — for local database dev)**
  - Only required if you intend to run a local Postgres instance via `supabase start`
  - Install: `npm install -g supabase` (or use the standalone binary from `https://supabase.com/docs/guides/cli`)
  - Authenticate: `supabase login` — requires a Supabase personal access token (Dashboard → Account → Access Tokens)
  - Start local stack: `supabase start` — requires Docker Desktop (~7 GB RAM); exposes a local Postgres + Auth + Storage stack
  - For the MVP deploy, a hosted Supabase project (Steps 0B.1–0B.4) is sufficient — skip `supabase start` unless you need offline dev or migration tooling

  **Edge case — `supabase start` fails with Docker not running:**
  - Ensure Docker Desktop is running before calling `supabase start`
  - On Windows, Docker Desktop must be set to "Use WSL 2 based engine" (Settings → General)

---

## Phase 1 — Pre-Flight: Local Config Fixes

> Fix issues that would cause a deploy to fail or behave incorrectly before touching the dashboard.

- [x] **1.1 — Rename project in `wrangler.jsonc`** *(already done)*
  - `wrangler.jsonc` already has `"name": "10xcards"` — no change needed
  - The name must match the Cloudflare Pages project name exactly — mismatch breaks `wrangler` CLI commands (tail, deployment list, rollback)

- [ ] **1.2 — Add `OPENROUTER_API_KEY` to `astro.config.mjs` env schema**
  - Add to the `env.schema` block:
    ```js
    OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    ```
  - Without this declaration, `astro:env/server` cannot expose the variable even if it is set in the Cloudflare dashboard

- [ ] **1.3 — Create `.dev.vars` for local workerd dev**
  - Copy `.env.example` to `.dev.vars`; fill in real `SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY`
  - `wrangler dev` reads `.dev.vars`; it ignores `.env`
  - Confirm `.dev.vars` is in `.gitignore` — add it if missing

- [ ] **1.4 — Fix CI branch target (quality gate only — unrelated to deploy)**
  - Edit `.github/workflows/ci.yml`: change `branches: [master]` → `branches: [main]` (both occurrences)
  - This fix is only for the lint+build gate; Cloudflare Pages deploys independently regardless

- [ ] **1.5 — Verify local build**
  - Run: `npm run build`
  - Then: `npx wrangler types` — generates TypeScript bindings from `wrangler.jsonc`; fix any type errors before proceeding

  **Edge case — build fails with `ReferenceError: module is not defined in ES module scope`:**
  - A CJS-only transitive dependency is in the bundle
  - Run `npx wrangler dev 2>&1 | Select-String "require|cjs|module"` (PowerShell) to find the offending package
  - Add the package to Vite's `ssr.noExternal` in `astro.config.mjs` or swap for an ESM alternative

- [ ] **1.6 — Smoke-test auth + env vars with workerd runtime**
  - Run: `npm run dev`
  - Confirm `SUPABASE_URL` resolves: add a temporary test route returning `{url: SUPABASE_URL ? "ok" : "missing"}`
  - Run the full sign-up → sign-in → dashboard → sign-out flow in the browser before any production deploy

  **Edge case — redirect loop on sign-in locally:**
  - The current `middleware.ts` calls `supabase.auth.getUser()` on every request
  - If Supabase is unreachable (wrong URL/key in `.dev.vars`), `getUser()` returns null → redirect → loop
  - Check `SUPABASE_URL` format: `https://<ref>.supabase.co` — no trailing slash, no port
  - Check `SUPABASE_KEY`: must be the `anon` (public) key

  **Edge case — `astro:env/server` variable undefined despite being in `.dev.vars`:**
  - Confirm the variable name in `.dev.vars` exactly matches the name in `env.schema`
  - Restart `npm run dev` after editing `.dev.vars` (the dev server does not hot-reload secrets)

---

## Phase 2 — Cloudflare Dashboard Setup (Human-Only Gates)

> These steps require a browser. None can be automated by the agent.

- [ ] **2.1 — Create Cloudflare Pages project and connect to GitHub**
  - Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git
  - Authorize the Cloudflare GitHub App on the repo
  - Production branch: **`main`**
  - Framework preset: **None**
  - Build command: `npm run build`
  - Build output directory: `dist`
  - Project name: `10xcards` (must match `wrangler.jsonc` `"name"` from Phase 1.1)
  - After creation, Cloudflare immediately triggers the first deploy

- [ ] **2.2 — Set environment variables in Cloudflare Pages dashboard**
  - Pages project → Settings → Environment Variables → Add variable (Production scope)
  - Add: `SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY`
  - Mark each as **Encrypted**
  - Add the same variables under **Preview** scope if preview deploys should work end-to-end
  - **Note:** env vars take effect on the next deploy — if you add them after the initial deploy, trigger a redeploy manually

- [ ] **2.3 — Add GitHub Actions secrets (for CI lint+build gate only)**
  - GitHub repo → Settings → Secrets → Actions → New repository secret
  - Add `SUPABASE_URL` and `SUPABASE_KEY` (the CI `build` step in `ci.yml` needs them at build time)
  - `OPENROUTER_API_KEY` is not needed in CI unless a build-time route imports it at module level

- [ ] **2.4 — Disable Cloudflare Auto Minify**
  - Cloudflare Dashboard → your `*.pages.dev` zone → Speed → Optimization → Content Optimization
  - Disable **Auto Minify** (HTML, CSS, JS)
  - **Why:** Auto Minify mangles React hydration scripts, producing "Hydration completed but contains mismatches" errors with no obvious root cause

- [ ] **2.5 — Upgrade to Workers Paid plan before shipping AI routes**
  - Dashboard → Workers & Pages → Plans → Workers Paid ($5/month)
  - Free tier effective CPU per request: ~10 ms — insufficient for any OpenRouter call
  - Paid tier CPU limit: up to **5 minutes** (300 000 ms, raised March 2025)
  - Do this before any AI route is exposed in production, not after hitting the error

---

## Phase 3 — First Production Deploy

- [ ] **3.1 — Trigger deploy via git push**
  - After Phases 1 and 2 are complete:
    ```
    git add .
    git commit -m "chore: configure wrangler and env schema for cloudflare deploy"
    git push origin main
    ```
  - Cloudflare Pages Git integration auto-deploys — no `wrangler` command needed

- [ ] **3.2 — Monitor the Cloudflare build log**
  - Dashboard → Pages → `10xcards` → Deployments → click the active deployment
  - Watch for build errors — if `npm run build` fails, fix locally and repush

  **Edge case — build succeeds locally but fails on Cloudflare:**
  - Cloudflare builds in a Linux environment; Windows-only path separators or case-sensitive imports can cause failures
  - Check for import paths that differ only in casing (e.g., `@/components/Card` vs `@/components/card`)

- [ ] **3.3 — Trigger a redeploy if env vars were added after initial deploy**
  - Dashboard → Deployments → latest deployment → Retry deployment
  - Or: push an empty commit: `git commit --allow-empty -m "chore: trigger redeploy for env vars"`

- [ ] **3.4 — Confirm production URL loads**
  - Cloudflare assigns `10xcards.pages.dev` on first deploy
  - Open in browser and confirm the homepage renders without errors

- [ ] **3.5 — Stream live logs during verification**
  ```
  npx wrangler pages deployment tail --project-name 10xcards
  ```
  - Filter to errors only:
    ```
    npx wrangler pages deployment tail --project-name 10xcards --status error
    ```
  - Pages log tail has a few-second delay — this is expected, not a sign of a problem

  **Edge case — `Error: Could not route request` when running tail:**
  - The project name must exactly match what is shown in the Cloudflare dashboard
  - Run `npx wrangler pages project list` to confirm

---

## Phase 4 — External Integration Verification

### 4A — Supabase Auth

- [ ] **4A.1 — Sign-up flow**
  - Visit `https://10xcards.pages.dev/auth/signup` → create a new account
  - Confirm email confirmation arrives and redirect to dashboard works

- [ ] **4A.2 — Sign-in / sign-out flow**
  - Sign in with created account → confirm `/dashboard` loads
  - Sign out → confirm redirect to `/auth/signin`
  - Hard-refresh `/dashboard` while signed in → confirm session persists (not redirected)

  **Edge case — redirect loop after sign-in on production (not in local dev):**
  - Cause: `SUPABASE_URL` or `SUPABASE_KEY` is set incorrectly in the Cloudflare dashboard
  - Confirm via `wrangler pages deployment tail`: look for repeated `302` responses on `/dashboard`
  - Also check: Supabase project → Authentication → URL Configuration → add `https://10xcards.pages.dev` to allowed redirect URLs; if missing, auth callbacks fail silently

- [ ] **4A.3 — Add production URL to Supabase allowed origins**
  - Supabase dashboard → Authentication → URL Configuration
  - Add `https://10xcards.pages.dev` to **Site URL** and **Redirect URLs**
  - Without this, email confirmation links redirect to a wrong origin

### 4B — OpenRouter AI Routes

- [ ] **4B.1 — Confirm `OPENROUTER_API_KEY` is set and the deployment includes it** (Phase 2.2 + 3.3)

- [ ] **4B.2 — Test AI route response**
  - Hit an AI route manually (e.g., `POST /api/generate`) with a minimal payload via browser or curl
  - Confirm a valid response — not a `Worker exceeded CPU time limit` error

  **Edge case — `Worker exceeded CPU time limit` on first request:**
  - This means Phase 2.5 (Paid plan upgrade) was not completed
  - Upgrade the plan; the route will work immediately without a redeploy

  **Edge case — OpenRouter returns 401:**
  - `OPENROUTER_API_KEY` is missing or was added after the last deploy
  - Re-check Phase 2.2 and trigger a redeploy (Phase 3.3)

  **Edge case — streaming response hangs or cuts off:**
  - Cloudflare Pages supports `ReadableStream` / `TransformStream` natively
  - Ensure the AI route sets `Content-Type: text/event-stream` and does not buffer the full response
  - Confirm the route does not hold CPU during the wait for OpenRouter's response (use `await` on the stream, not polling)

---

## Phase 5 — Operational Verification

- [ ] **5.1 — Test rollback**
  - List deployments: `npx wrangler pages deployment list --project-name 10xcards`
  - Make a trivial change, push; wait for deploy to complete
  - Roll back: `npx wrangler rollback --project-name 10xcards [previous-deployment-id]`
  - Confirm the previous version is served at `10xcards.pages.dev`

- [ ] **5.2 — Confirm preview deploys work**
  - Create a feature branch, push a trivial change
  - Confirm Cloudflare auto-deploys to `<branch>.10xcards.pages.dev`
  - Preview branches share Production env vars unless you scope separate Preview variables (Phase 2.2)

- [ ] **5.3 — Update this file post-deploy**
  - Fill in: production URL, date deployed, which secrets are confirmed wired, Paid plan status, Supabase redirect URLs added
  - This file is the audit trail consumed by downstream milestone-planning skills as ground truth for "what's deployed and which secrets are wired"

---

## Files Modified

| File | Change |
|---|---|
| `wrangler.jsonc` | `"name"` → `"10xcards"` |
| `astro.config.mjs` | Add `OPENROUTER_API_KEY` to `env.schema` |
| `.github/workflows/ci.yml` | `master` → `main` (quality gate only, unrelated to deploy) |
| `.dev.vars` (new, gitignored) | Secrets for local `wrangler dev` |

---

## End-to-End Verification Checklist

- [ ] `npm run build` passes locally
- [ ] `npx wrangler types` produces no errors
- [ ] `npm run dev` starts; env vars readable; auth flow works in workerd runtime
- [ ] CI passes on `main` (lint + build)
- [ ] Cloudflare Pages project created; production branch = `main`
- [ ] All 3 env vars set in Cloudflare dashboard (Production scope)
- [ ] Auto Minify disabled in Cloudflare dashboard
- [ ] Workers Paid plan active
- [ ] Production URL (`10xcards.pages.dev`) loads homepage
- [ ] Sign-up → sign-in → dashboard → sign-out works on production URL
- [ ] Supabase allowed redirect URLs include production URL
- [ ] AI route returns valid response on production
- [ ] Rollback tested and confirmed working
