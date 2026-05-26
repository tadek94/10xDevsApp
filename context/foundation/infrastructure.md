---
project: 10xCards
researched_at: 2026-05-25
recommended_platform: Cloudflare Pages + Workers
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro (SSR, output: server)
  runtime: Cloudflare workerd (via @astrojs/cloudflare adapter)
  database: Supabase (external)
  ai: OpenRouter (external)
---

## Recommendation

**Deploy on Cloudflare Pages + Workers.**

The project already uses the `@astrojs/cloudflare` adapter and targets Cloudflare Pages in `tech-stack.md`. No adapter swap is needed — the deployment target is baked into the stack. Cloudflare's free tier (100k requests/day) comfortably covers the MVP's low-QPS load, the `wrangler` CLI covers the full operational loop (deploy, rollback, log tail) without a browser, and the MCP server integration is GA. The developer has existing Cloudflare familiarity, removing the learning-curve cost that a platform switch would introduce in a 3-week after-hours window. The anti-bias cross-check surfaced four real risks (nodejs_compat beta, CPU time limits on AI routes, Supabase cookie middleware compatibility, wrangler.jsonc binding contract); all are pre-mitigatable with the steps in the risk register below.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent docs | Stable deploy API | MCP integration | Total |
|---|---|---|---|---|---|---|
| **Cloudflare Pages** | Pass | Pass | Pass | Pass | Pass | **5/5** |
| Netlify | Pass | Pass | Partial | Pass | Pass | 4.5/5 |
| Fly.io | Pass | Partial | Pass | Pass | Pass | 4/5 |
| Railway | Pass | Partial | Pass | Pass | Pass | 4/5 |
| Vercel | Pass | Pass | Partial | Pass | Partial | 3.5/5 |
| Render | Partial | Partial | Partial | Pass | Pass | 3/5 |

**Scoring notes:**

- **CLI-first**: Cloudflare — `wrangler deploy`, `wrangler rollback` (GA), `wrangler pages deployment tail`; Netlify — `netlify deploy`, `netlify logs` (added May 2026), rollback via republish; Vercel — `vercel --prod`, `vercel rollback`, `vercel logs`; Railway — `railway deploy`, `railway logs`, `railway redeploy`; Fly.io — `fly deploy`, log tail, image-based rollback (no single rollback command); Render — REST API + deploy hooks, less comprehensive CLI.
- **Managed/serverless**: Cloudflare, Netlify, Vercel are fully abstracted; Fly.io and Railway are container-based with more operational surface; Render is a web service model with some managed aspects.
- **Agent docs**: Cloudflare and Fly.io maintain markdown-based docs on GitHub; Railway has markdown docs on GitHub; Netlify and Vercel have partial markdown (integration guides on GitHub, but main docs are proprietary/SPA-hosted); Render partially available.
- **Stable deploy API**: All platforms except Render offer deterministic one-command deploy. Render uses deploy hooks + REST API (GA but less ergonomic).
- **MCP**: Cloudflare MCP (GA, `workers-mcp`), Netlify MCP (GA, Feb 2025), Railway MCP (GA, 2026), Fly.io MCP (GA, `flymcp`), Render MCP (GA); Vercel MCP (beta, Aug 2025).

### Shortlisted Platforms

#### 1. Cloudflare Pages + Workers (Recommended)

Wins on stack alignment — the adapter is already configured, environment variable access (`astro:env/server`) is already wired to the Cloudflare workerd runtime, and the developer is familiar with the platform. Free tier is sufficient for all MVP traffic. `wrangler` provides the most complete CLI for the operational loop. MCP integration is GA. The four risks identified in the cross-check are all knowable in advance and pre-mitigatable; none are blockers if addressed before coding starts.

#### 2. Netlify

Scores second because the Netlify MCP Server is GA (the most production-ready AI agent integration in the candidate pool), the free credit tier is generous, and Astro's `@astrojs/netlify` adapter is mature. The gap vs. Cloudflare is the required adapter swap (`@astrojs/cloudflare` → `@astrojs/netlify`), the re-testing of `astro:env/server` under a Node.js runtime, and the less intuitive rollback flow (no native `netlify rollback` command — republish a prior deploy). In a different scenario (no existing Cloudflare adapter, no familiarity), Netlify would be the recommendation.

#### 3. Fly.io

Third because it offers full Node.js container support (no workerd compatibility surprises), a GA MCP server, and strong `flyctl` CLI. The gap vs. the top two: no free tier (~$5–15/month), requires an adapter swap to `@astrojs/node`, and there is a known community-reported issue with environment variables being undefined in Astro SSR despite `fly secrets` configuration. For a 3-week after-hours budget, the additional cost and adapter swap friction are avoidable.

## Anti-Bias Cross-Check: Cloudflare Pages

### Devil's Advocate — Weaknesses

1. **`nodejs_compat` is beta** — the flag enabling Node.js built-in APIs is not GA. If Supabase, the Anthropic SDK, or OpenRouter's client library hits an unsupported API, the build breaks at runtime with a non-obvious error.
2. **CPU time limit: 50ms (Free) / 30s (Paid)** — AI routes calling OpenRouter can hit the 50ms CPU limit on the free plan before a response completes. The $5/month paid plan may be required solely because of AI route CPU time, not request volume.
3. **Supabase `@supabase/ssr` cookie middleware compatibility** — `Response.headers.append` is immutable in some Cloudflare middleware paths, which can cause the auth cookie to silently fail to set, producing redirect loops that look like auth bugs.
4. **CommonJS dependencies are a hard wall** — any npm package that ships only a CJS bundle fails at runtime without pre-compilation. AI SDK dependencies evolve quickly; this can appear unexpectedly mid-sprint.
5. **`wrangler pages deployment tail` log latency** — log tailing on Pages has several-second delays vs. real-time feedback on Node.js platforms, slowing the debug loop for AI route timeouts.

### Pre-Mortem — How This Could Fail

The team deployed Astro SSR on Cloudflare Pages for their MVP. Six months later, the decision cost two full sprint days of debugging. The failure had three compounding roots. First, the Supabase SSR client imported `@supabase/ssr` at a version that internally pulled a CommonJS-only transitive dependency — the build succeeded locally (Node.js) but silently produced a Workers bundle that crashed on the first authenticated request. The error message was `ReferenceError: module is not defined in ES module scope` inside a minified bundle with no line reference. Second, a mid-project upgrade of the Anthropic SDK added a `node:buffer` import handled differently under `nodejs_compat` beta — the flag had to be pinned to a specific compatibility date, breaking all requests until the developer found the fix in a Cloudflare community post from 2024. Third, the `astro:env/server` preview-required compatibility date conflicted with the nodejs_compat date, requiring a manual `[compatibility_flags]` override in `wrangler.jsonc` that was not captured in the starter template. Each problem was solvable in isolation; hitting all three in a 3-week after-hours window caused the MVP to ship one week late.

### Unknown Unknowns

1. **Pages vs. Workers are separate deployment surfaces** — `wrangler pages deploy` differs from `wrangler deploy`. Environment variables are set per-project in Pages, not as Workers secrets. Naming, commands, and dashboards differ subtly; following Workers tutorials for a Pages project produces confusing errors.
2. **CPU time limits can bite AI routes on the free tier** — the workerd CPU time limit (50ms free / 30s paid) is separate from wall-clock time. OpenRouter streaming responses processing tokens in JS can exceed the free limit. Budget $5/month for the paid plan regardless of request volume.
3. **Supabase cookie helpers and immutable Cloudflare `Response`** — the `Response` object in some Cloudflare middleware paths is immutable after construction. The Supabase SSR cookie-setting pattern may fail silently, causing redirect loops.
4. **No persistent file system** — any npm package that writes temp files will fail at runtime. Not a PRD concern today, but a trap for future features.
5. **`wrangler.jsonc` + `astro.config.mjs` binding contract is fragile** — Cloudflare bindings (KV, D1, R2) must match exactly across both files. A name mismatch produces a `undefined` binding at runtime, not a build error.

## Operational Story

- **Preview deploys**: Every `git push` to a non-production branch deploys to a `<branch>.<project>.pages.dev` URL automatically via the Cloudflare Pages Git integration. Preview URLs are public by default — protect with Cloudflare Access if the content is sensitive. Fork PRs from external contributors do not auto-deploy (requires Pages access).
- **Secrets**: Environment variables and API keys live in the Cloudflare Pages dashboard under Settings → Environment Variables, scoped to Production or Preview. For local dev, copy to `.dev.vars` (read by `wrangler dev`; never commit this file). Rotation: update in dashboard, re-deploy to pick up; no downtime required.
- **Rollback**: `wrangler rollback [deployment-id]` (GA since wrangler v2.13) re-routes traffic to a prior deployment within seconds. Find deployment IDs with `wrangler pages deployment list`. Note: database migrations (Supabase) do not roll back automatically — coordinate rollback with a schema-safe deploy.
- **Approval**: Pushes to the production branch auto-deploy without approval. An agent may run `wrangler deploy` / `wrangler rollback` unattended. Actions requiring human approval: rotating the primary Supabase key (done in Supabase dashboard), billing tier changes (done in Cloudflare dashboard), custom domain binding.
- **Logs**: `wrangler pages deployment tail --project-name <name>` streams live logs read-only. Filter by `--status error` for errors only. Note: Pages tail has a few-second delay; use `wrangler tail` (Workers) for lower latency when testing Worker-only routes.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| `nodejs_compat` beta causes runtime crash on unsupported API | Devil's advocate | Medium | High | Pin `compatibility_date` and `nodejs_compat` flag in `wrangler.jsonc` before first deploy; test `@supabase/ssr` and Anthropic SDK in `wrangler dev` before pushing to production |
| AI routes exceed 50ms CPU time limit on free tier | Unknown unknowns | Medium | Medium | Upgrade to the $5/month Workers Paid plan before shipping AI routes; CPU limit becomes 30s |
| Supabase cookie middleware fails silently in Cloudflare middleware | Unknown unknowns | Medium | High | Test the full auth flow (sign-up → redirect → dashboard) in `wrangler dev` before first deploy; use `wrangler pages deployment tail` to watch for redirect loops |
| CJS-only npm dependency breaks Workers bundle | Devil's advocate | Low | High | Run `wrangler dev` locally after every SDK upgrade to catch CJS errors before they reach production |
| `wrangler.jsonc` / `astro.config.mjs` binding name mismatch | Unknown unknowns | Low | Medium | Keep bindings list in a single source-of-truth comment; add `wrangler types` to the pre-deploy checklist to generate TypeScript types and catch mismatches at compile time |
| `astro:env/server` undefined because compatibility date too old | Research finding | Low | High | Set `compatibility_date = "2025-04-01"` (minimum required) in `wrangler.jsonc`; verify with `wrangler dev` before first deploy |
| Pre-mortem: multiple compatibility flag conflicts mid-sprint | Pre-mortem | Low | High | Lock `wrangler.jsonc` compatibility settings at project start; document the locked values in a `DEPLOYMENT.md`; only change with intentional review |

## Getting Started

1. **Install / update wrangler**: `npm install -g wrangler@latest` — verify version is 3.x or higher with `wrangler --version`.
2. **Authenticate**: `wrangler login` — opens a browser for Cloudflare OAuth; stores credentials locally.
3. **Configure `wrangler.jsonc`** — set `compatibility_date = "2025-04-01"` (required for `astro:env/server`) and add `nodejs_compat` to `compatibility_flags`. Verify with `wrangler types` to generate TypeScript bindings.
4. **Local dev with workerd runtime**: `npm run dev` runs `astro dev` backed by the Cloudflare adapter's local runtime. Secrets go in `.dev.vars` (not `.env`). Confirm `SUPABASE_URL` and `SUPABASE_KEY` are readable via `astro:env/server` in a test route before proceeding.
5. **First production deploy**: Push to the `main` branch — Cloudflare Pages Git integration auto-deploys. Verify the deployment URL, check `wrangler pages deployment tail` for errors, and test the auth flow end-to-end.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (beyond the built-in Pages Git integration)
- Production-scale architecture (multi-region, HA, DR)

