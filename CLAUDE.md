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

## 10xDevs AI Toolkit - Module 2, Lesson 4

Prepare for a harder implementation stream with the **research-backed planning chain**:

```
internal research (/10x-research) + external research (exa.ai, Context7) -> /10x-plan -> /10x-implement -> success
```

The lesson focus is distinguishing internal from external research and using evidence to back planning decisions.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Internal research (lesson focus)** | |
| `/10x-research <change-id>` | You need evidence from the existing codebase — patterns, conventions, integration points, or existing implementations. Runs parallel sub-agents over the repo and writes structured findings to `research.md`. |
| **External research (lesson focus)** | |
| exa.ai | You need AI-native web search for library comparisons, best practices, or ecosystem context that the codebase cannot answer. |
| Context7 (`resolve-library-id` → `get-library-docs`) | You need live, current documentation for a specific library or framework. Resolves a library ID first, then fetches relevant doc pages. |
| **Framing spare wheel** | |
| `/10x-frame <change-id>` | The plan won't converge, the plan doesn't deliver expected results, or persistent drift keeps breaking the implementation. Use as an escape hatch on a separate problem (demonstrated on Space Explorers example), not as pre-research ritual. |
| **Planning and execution** | |
| `/10x-plan <change-id>` / `/10x-implement <change-id> phase <n>` | Use the same planning and execution chain from Lesson 2, now with upstream research evidence feeding the plan. |

### Research discipline

- Internal research (`/10x-research`) answers "what does our codebase already do?" — patterns, schemas, conventions, integration points.
- External research (exa.ai, Context7) answers "what should we do?" — library capabilities, API docs, ecosystem best practices.
- Combine both as evidence-backed input to `/10x-plan`. A plan without research evidence on a non-trivial stream is a guess.
- Agent-friendly docs (`llms.txt`, markdown-for-agents, `/md` endpoints) are a quality signal for library selection — libraries that publish agent-readable docs integrate faster.

### `/10x-frame` as spare wheel

Three triggers for reaching for `/10x-frame`:
1. The plan won't converge — research keeps opening more questions instead of narrowing to a contract.
2. The plan doesn't deliver — implementation repeatedly fails to meet success criteria.
3. Persistent drift — the implementation keeps diverging from the plan in ways that suggest the problem was mis-framed.

Demonstrated on a Space Explorers example, not the SRS path. It is an escape hatch, not a mandatory step.

### Paths used by this lesson

- `context/changes/<change-id>/research.md` - internal research output
- `context/changes/<change-id>/frame.md` - framing output when needed
- `context/changes/<change-id>/plan.md` - evidence-backed implementation contract
- `context/foundation/lessons.md` - recurring rules and pitfalls

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
