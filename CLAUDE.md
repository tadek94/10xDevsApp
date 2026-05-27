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

## 10xDevs AI Toolkit - Module 2, Lesson 1

Move from sprint-zero setup to project orchestration with the **roadmap chain**:

```
(Module 1 foundation docs) -> /10x-roadmap -> backlog-ready roadmap items
```

`/10x-roadmap` is the lesson focus. `/10x-new` is intentionally introduced in Module 2, Lesson 2, when a selected roadmap item becomes an implementation change folder.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Roadmap (lesson focus)** | |
| `/10x-roadmap` | You have `context/foundation/prd.md` and a scaffolded project baseline, and you need a vertical-first MVP roadmap. The skill reads the PRD, inspects the code baseline, uses available foundation docs such as `tech-stack.md`, `infrastructure.md`, and `deploy-plan.md`, then writes `context/foundation/roadmap.md`. Use it BEFORE creating per-change folders or implementation plans. |
| **Re-run upstream if needed** | |
| `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-infra-research` | Bundled from Module 1 so foundation contracts can be fixed before roadmap sequencing. If roadmap generation exposes a PRD gap, repair the PRD before pretending the backlog is ready. |

### How the chain hands off

- `/10x-roadmap` bridges product and implementation. It does not choose frameworks, design schemas, or write a per-change implementation plan.
- The output is `context/foundation/roadmap.md`: ordered milestones, vertical slices, bounded foundations, dependencies, unknowns, risk, and backlog handoff fields.
- Roadmap items should receive stable human-readable identifiers in backlog tools. The actual `context/changes/<change-id>/` folder is created in Lesson 2 with `/10x-new`.

### Roadmap boundaries

- Default to vertical slices: user-visible outcomes that cross UI, data, business logic, and integrations.
- Horizontal work is allowed only as a bounded enabler that names the downstream vertical milestone it unlocks.
- Avoid orphan horizontal work such as "build the whole database", "build all API endpoints", or "design the whole UI" before the first user-visible flow.
- Roadmap is not a calendar estimate. Do not invent dates, story points, or sprint velocity unless the user explicitly asks for a separate planning artifact.

### Foundation paths used by this lesson

- `context/foundation/prd.md` - input
- `context/foundation/tech-stack.md` - optional input
- `context/foundation/infrastructure.md` - optional input
- `context/deployment/deploy-plan.md` - optional input
- `context/foundation/roadmap.md` - output
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
