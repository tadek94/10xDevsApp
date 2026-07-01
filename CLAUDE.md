# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths). Always use this alias for internal imports.
- **Astro components** for static content/layout; **React components** only when a component requires state, event handlers, refs, `useEffect`, or browser-only APIs (`localStorage`, Web Workers, etc.). If none of those are needed, use `.astro`.
- **Tailwind class merging**: use `cn()` from `@/lib/utils` (clsx + tailwind-merge) — never manually concatenate class strings.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Add new ones with `npx shadcn@latest add [name]`.
- **API routes**: export named `GET`, `POST`, etc. handlers; validate input with zod.
- **Supabase migrations**: `supabase/migrations/` with naming `YYYYMMDDHHmmss_short_description.sql`. Enable RLS on all new tables with per-operation, per-role policies.
- **React**: no Next.js directives (`"use client"` etc.). Extract hooks to `src/components/hooks/`.
- **Services/helpers** go in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs) go in `src/types.ts`.

## Date Handling

- Always use UTC dates.
- Always format output using `formatDate()`.
- Do not use `new Date().toISOString()`.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime via `astro dev`)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build locally
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

No test runner is configured — lint and build are the verification steps.

## Architecture

See `@README.md` for stack overview.

### Rendering mode

Full server-side rendering (`output: "server"` in `astro.config.mjs`). All pages are server-rendered by default. API routes must export `export const prerender = false` if the file doesn't already have it.

### Auth flow

- `src/lib/supabase.ts` — Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Reads `SUPABASE_URL` / `SUPABASE_KEY` from `astro:env/server` (server-only secrets). Returns `null` when env vars are missing so pages degrade gracefully.
- `src/middleware.ts` — runs on every request; resolves the current user and attaches it to `context.locals.user`. Add paths to `PROTECTED_ROUTES` there to require auth.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected page example: `src/pages/dashboard.astro`

### Environment

- Node.js v22.14.0 (see `.nvmrc`)
- Env vars: `SUPABASE_URL`, `SUPABASE_KEY` — copy `.env.example` to `.env` for local Node, or to `.dev.vars` for Cloudflare local dev (`wrangler dev` reads `.dev.vars`, not `.env`).
- Local Supabase: `npx supabase start` (requires Docker, ~7 GB RAM)
- Deploy: `npx wrangler deploy` after `npm run build`

### CI

See `@.github/workflows/ci.yml`.

## Deployment rules

- **Tokens are scoped, not master keys.** Cloudflare API token: limited to Workers for this project only — no DNS, no billing, no unrelated projects.
- **Tokens live in env vars, not committed files.** Never put `CLOUDFLARE_API_TOKEN` or `SUPABASE_KEY` in `.mcp.json`, `wrangler.jsonc`, or any tracked file.
- **Destructive actions are human-only.** Drop a database, rotate a primary secret, delete a Worker — panel-by-hand only. Manual click costs 30 seconds; cleanup after an automated mistake costs hours.
- **`context/archive/` is immutable.** Never write to `context/archive/`. If a resolved target path starts with `context/archive/`, abort and tell the user to open a new change with `/10x-new`.

---

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the `/10x-e2e` skill.** It is the single source of truth
for the workflow — risk → seed test + rules → generate → review against the five
anti-patterns → re-prompt → verify. The skill's `references/` carry the full
rules, anti-patterns, seed pattern, and prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toMatchSnapshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **Healer helps on selectors, harms on logic.** A changed selector → healer
  re-finds it (route through PR review). A changed business behavior → healer
  masks the bug; that failing-test-to-fix case is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->
