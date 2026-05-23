---
bootstrapped_at: 2026-05-23T00:00:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: 10xcards
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10xcards
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

### Why this stack

Solo developer shipping a spaced repetition flashcard app (10xCards) in a 3-week after-hours window, with auth and AI generation as the two technology-forcing features. The `10x-astro-starter` is the vetted recommended default for `(web-app, js)` and clears all four agent-friendly gates: fully TypeScript-typed, strongly convention-based (Astro file-based routing + Supabase schema), well-represented in training data, and link-able current docs. Supabase covers auth and Postgres persistence out of the box, removing two build-from-scratch surfaces that would eat the constrained timeline. AI/LLM calls land in Astro API routes with no extra framework needed. Payments, realtime, and background jobs are explicitly out of scope per PRD non-goals. CI runs on GitHub Actions with auto-deploy on merge to Cloudflare Pages — the starter's default shape, no additional wiring required.

## Pre-scaffold verification

| Signal      | Value                                             | Severity | Notes                                                     |
| ----------- | ------------------------------------------------- | -------- | --------------------------------------------------------- |
| npm package | not run                                           | n/a      | cmd_template starts with `git clone`; npm check skipped   |
| GitHub repo | przeprogramowani/10x-astro-starter pushed 2026-05-17 | fresh | last pushed 6 days before scaffold run; within 3-month window |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone (clone starter repo, delete upstream `.git/`, move files up, remove temp dir)
**Exit code**: 0
**Files/directories moved**: 18 (`.github`, `.husky`, `node_modules`, `public`, `src`, `supabase`, `.env.example`, `.gitignore`, `.nvmrc`, `.prettierrc.json`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `package-lock.json`, `package.json`, `README.md`, `tsconfig.json`, `wrangler.jsonc`)
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold`, `.vscode/settings.json.scaffold`
**.vscode merge**: `extensions.json` and `launch.json` moved silently (new); `settings.json` sidelined as `.scaffold` sibling (existing cwd file wins)
**.gitignore handling**: moved silently (was not present in cwd)
**context/ handling**: no `context/` dir in scaffold; nothing dropped
**.bootstrap-scaffold cleanup**: deleted (was empty after move-up)

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: Direct: 0 CRITICAL, 0 HIGH, 2 MODERATE (`@astrojs/check`, `wrangler`) of total 0/1/9/0

#### CRITICAL findings

None.

#### HIGH findings

| Package  | Version range | Advisory ID                                                  | Description                              | Fix available |
| -------- | ------------- | ------------------------------------------------------------ | ---------------------------------------- | ------------- |
| devalue  | 5.6.3–5.8.0   | [GHSA-77vg-94rm-hx3p](https://github.com/advisories/GHSA-77vg-94rm-hx3p) | DoS via sparse array deserialization; CVSS 7.5 | Yes (update devalue) |

`devalue` is a **transitive** dependency (`isDirect: false`). No package you explicitly installed pulls it directly — it surfaces through the dependency graph. Fix is available via `npm audit fix`.

#### MODERATE findings

| Package               | isDirect | Advisory / Cause                                           | Fix available |
| --------------------- | -------- | ---------------------------------------------------------- | ------------- |
| @astrojs/check        | true     | via @astrojs/language-server → volar-service-yaml → yaml  | Yes (downgrade to 0.9.2, semver-major) |
| @astrojs/language-server | false | via volar-service-yaml                                    | Yes (via @astrojs/check downgrade) |
| @cloudflare/vite-plugin | false  | via miniflare, wrangler, ws                               | Yes |
| miniflare             | false    | via ws (GHSA-58qx-3vcg-4xpx)                             | Yes |
| volar-service-yaml    | false    | via yaml-language-server                                  | Yes (via @astrojs/check downgrade) |
| wrangler              | true     | via miniflare → ws                                        | Yes |
| ws                    | false    | [GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx) — Uninitialized memory disclosure; CVSS 4.4 | Yes (ws ≥ 8.20.1) |
| yaml                  | false    | [GHSA-48c2-rrv3-qjmp](https://github.com/advisories/GHSA-48c2-rrv3-qjmp) — Stack overflow via deeply nested YAML; CVSS 4.3 | Yes (via @astrojs/check downgrade) |
| yaml-language-server  | false    | via yaml                                                  | Yes (via @astrojs/check downgrade) |

#### LOW / INFO findings

None.

## Hints recorded but not acted on

These hint values were read from the hand-off and carried into this log for audit-trail completeness. Bootstrapper v1 does not act on them; the future M1L4 skill ("Memory Architecture") is the planned consumer.

| Hint                    | Value              |
| ----------------------- | ------------------ |
| bootstrapper_confidence | first-class        |
| quality_override        | false              |
| path_taken              | standard           |
| self_check_answers      | null               |
| team_size               | solo               |
| deployment_target       | cloudflare-pages   |
| ci_provider             | github-actions     |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true               |
| has_payments            | false              |
| has_realtime            | false              |
| has_ai                  | true               |
| has_background_jobs     | false              |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep: `CLAUDE.md.scaffold` and `.vscode/settings.json.scaffold`.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log. Run `npm audit fix` for the automatically fixable subset.
