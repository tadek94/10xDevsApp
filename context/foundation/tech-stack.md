---
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
---

## Why this stack

Solo developer shipping a spaced repetition flashcard app (10xCards) in a 3-week after-hours window, with auth and AI generation as the two technology-forcing features. The `10x-astro-starter` is the vetted recommended default for `(web-app, js)` and clears all four agent-friendly gates: fully TypeScript-typed, strongly convention-based (Astro file-based routing + Supabase schema), well-represented in training data, and link-able current docs. Supabase covers auth and Postgres persistence out of the box, removing two build-from-scratch surfaces that would eat the constrained timeline. AI/LLM calls land in Astro API routes with no extra framework needed. Payments, realtime, and background jobs are explicitly out of scope per PRD non-goals. CI runs on GitHub Actions with auto-deploy on merge to Cloudflare Pages — the starter's default shape, no additional wiring required.
