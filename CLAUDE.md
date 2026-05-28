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

## 10xDevs AI Toolkit - Module 2, Lesson 2

Turn one roadmap item into the first implementation cycle with the **change planning chain**:

```
/10x-roadmap -> /10x-new -> /10x-plan -> /10x-plan-review -> /10x-implement
```

`/10x-new`, `/10x-plan`, `/10x-plan-review`, and `/10x-implement` are the lesson focus. `/10x-frame` and `/10x-research` are not required rituals here; they are escalation paths introduced in the next lesson.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Change setup (lesson focus)** | |
| `/10x-new <change-id>` | You selected a roadmap item and need a stable change folder. Creates `context/changes/<change-id>/change.md` so planning, implementation, progress, commits, and later review all share one identity. Use AFTER roadmap selection, BEFORE `/10x-plan`. |
| **Planning (lesson focus)** | |
| `/10x-plan <change-id>` | You have a change folder and need a reviewable implementation plan. Reads roadmap context, foundation docs, codebase evidence, and any existing change notes; writes `plan.md` and `plan-brief.md` with phases, file contracts, success criteria, and `## Progress`. |
| **Plan readiness (lesson focus)** | |
| `/10x-plan-review <change-id>` | You have `plan.md` and need a light pre-code readiness check. Use it to catch missing end state, weak contracts, malformed progress, scope drift, or blind spots before code changes begin. |
| **Implementation (lesson focus)** | |
| `/10x-implement <change-id> phase <n>` | You have an approved plan and want to execute one phase with verification, manual gate, commit ritual, and SHA write-back to `## Progress`. |
| **Lifecycle closure** | |
| `/10x-archive <change-id>` | A change is merged or intentionally closed. Move it out of active `context/changes/` into archive state. |

### How the chain hands off

- `/10x-new` creates the durable change identity.
- `/10x-plan` turns that identity into an implementation contract.
- `/10x-plan-review` checks the plan before the agent mutates code.
- `/10x-implement` executes one planned phase, verifies, asks for manual confirmation when needed, commits, and records progress.

### Lesson boundaries

- Plan is the default router after roadmap selection. Start with `/10x-plan` unless the problem is unclear or external evidence is blocking.
- Do not run `/10x-frame + /10x-research` as ceremony for every change.
- Do not turn this lesson into a full end-to-end product build. A checkpoint with a planned and partially or fully implemented stream is valid.
- Code review of the implemented diff belongs to Lesson 3 via `/10x-impl-review`.
- Lifecycle closure via `/10x-archive` after a change is merged or intentionally closed.

### Paths used by this lesson

- `context/foundation/roadmap.md` - upstream roadmap
- `context/changes/<change-id>/change.md` - change identity
- `context/changes/<change-id>/plan.md` - implementation contract
- `context/changes/<change-id>/plan-brief.md` - compressed handoff
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
