# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Cloudflare Workers Deploy: Run from Root, Not from dist/server/

- **Context**: Deploying Astro SSR with `@astrojs/cloudflare` adapter v13+.
- **Problem**: Running `wrangler deploy` from `dist/server/` causes a config conflict error ("Found both a user configuration file and a deploy configuration file that do not share the same base path"). The adapter generates `.wrangler/deploy/config.json` at the project root, and wrangler must be run from there.
- **Rule**: Always run `npx wrangler deploy` from the **project root**. Wrangler reads `.wrangler/deploy/config.json` which redirects to `dist/server/wrangler.json` automatically.
- **Corollary**: If the adapter adds bindings (SESSION KV, IMAGES) that don't exist in Cloudflare yet, the first deploy will fail with "already exists" or "not found" errors. Pre-create or pin the resources in `wrangler.jsonc` before the second deploy.
- **Corollary**: `imageService: "passthrough"` should be set in the adapter config when Cloudflare Images is not needed — otherwise the adapter adds an IMAGES binding that requires a paid Cloudflare Images subscription.
- **Applies to**: deploy

## Always Set a Kill Date on Feature Flags

- **Context**: Planning & implementation phases — any point where a feature flag is introduced.
- **Problem**: Flags accumulate and are never cleaned up; dead flags litter the codebase and block future refactors.
- **Rule**: Feature flags should always have a kill date. Record the date (or milestone) at the time the flag is introduced — not as an afterthought.
- **Applies to**: plan, implement, impl-review
