# Cloudflare Workers — Deploy Plan (executed 2026-05-26)

## Context

The project (10xCards) is an Astro 6 SSR app with `@astrojs/cloudflare` adapter v13+.

**Deploy mechanism:** GitHub Actions → `wrangler deploy` on every push to `main`.
Cloudflare Pages Git integration was attempted but abandoned — `@astrojs/cloudflare` v13+
uses the Workers + Assets model and is incompatible with the Pages Git integration build system
(Pages expects `_worker.js` at the output root; adapter v13 generates `dist/server/entry.mjs`).

**Production URL:** https://10xdevsapp.tadeusz-karczynski.workers.dev  
**Worker name:** `10xdevsapp`  
**Account ID:** `6a2198114e119e5cced7141213d8216b`

---

## What was found during setup

- `wrangler.jsonc` — `compatibility_date: "2026-05-08"`, `nodejs_compat` flag present
- `astro.config.mjs` — `@astrojs/cloudflare` adapter, all env vars already declared as `astro:env/server` secrets (optional)
- `.dev.vars` — `SUPABASE_URL` and `SUPABASE_KEY` present; `OPENROUTER_API_KEY` absent (key not available)
- `@astrojs/cloudflare` adapter auto-adds `SESSION` KV and `IMAGES` bindings by default:
  - `IMAGES` — disabled via `imageService: "passthrough"` (Cloudflare Images is a paid service, not used in code)
  - `SESSION` — KV namespace `10xdevsapp-session` was auto-provisioned during first deploy; ID pinned in `wrangler.jsonc` to prevent duplicate creation on subsequent deploys
- CI (`ci.yml`) was already targeting `main` branch correctly

---

## Executed Steps

### Phase 1 — Local config

- [x] **`astro.config.mjs`** — added `imageService: "passthrough"` to disable unused Cloudflare Images binding
- [x] **`wrangler.jsonc`** — pinned SESSION KV namespace ID: `cc19b3691381499abd7c7aeaca9058ba`
- [x] **Build verified** — `npm run build` passes

### Phase 2 — Cloudflare secrets

- [x] **`SUPABASE_URL`** — set as Worker secret via `wrangler secret put`
- [x] **`SUPABASE_KEY`** — set as Worker secret via `wrangler secret put`
- [ ] **`OPENROUTER_API_KEY`** — not set (key not available); AI generation non-functional until added:
  ```bash
  npx wrangler secret put OPENROUTER_API_KEY --name 10xdevsapp
  ```

### Phase 3 — GitHub secrets

- [x] **`SUPABASE_URL`** — added to GitHub Actions secrets
- [x] **`SUPABASE_KEY`** — added to GitHub Actions secrets
- [x] **`CLOUDFLARE_API_TOKEN`** — added to GitHub Actions secrets (scoped "Edit Cloudflare Workers" token)

### Phase 4 — CI/CD workflow

- [x] **`.github/workflows/deploy.yml`** — auto-deploy on push to `main`:
  ```yaml
  - run: npm run build
    env:
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
  - run: npx wrangler deploy
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: 6a2198114e119e5cced7141213d8216b
  ```

### Phase 5 — First production deploy

- [x] **Manual deploy** — `npx wrangler deploy` from project root (via `.wrangler/deploy/config.json`)
- [x] **Auto-deploy verified** — GitHub Actions green on push to `main`
- [x] **Production URL responds** — HTTP 200

---

## Active Bindings

| Binding | Resource | ID |
|---------|----------|----|
| `env.SESSION` | KV Namespace | `cc19b3691381499abd7c7aeaca9058ba` |
| `env.ASSETS` | Assets | (auto) |
| `SUPABASE_URL` | Secret | — |
| `SUPABASE_KEY` | Secret | — |

---

## Operational Commands

```bash
# Deploy (manual)
npm run build && npx wrangler deploy

# Live logs
npx wrangler tail --name 10xdevsapp

# List deployments
npx wrangler deployments list --name 10xdevsapp

# Rollback
npx wrangler rollback --name 10xdevsapp
```

---

## Remaining Tasks

- [ ] **Add `OPENROUTER_API_KEY`** when key is available (see Phase 2 above)
- [ ] **Add production URL to Supabase allowed redirect URLs**
  - Supabase Dashboard → Authentication → URL Configuration
  - Add `https://10xdevsapp.tadeusz-karczynski.workers.dev` to Site URL and Redirect URLs
  - Required for email confirmation links to work correctly
- [ ] **Test auth flow end-to-end** — sign-up → confirm email → sign-in → dashboard → sign-out
- [ ] **Upgrade to Workers Paid plan** before shipping AI routes ($5/month; free tier CPU limit is too low for OpenRouter calls)
  - Cloudflare Dashboard → Workers & Pages → Plans → Workers Paid
- [ ] **Delete orphaned Cloudflare Pages project** (`10xdevsapp`) — created during failed Pages attempt, returns 404, serves no purpose
  - Cloudflare Dashboard → Workers & Pages → 10xdevsapp (Pages) → Settings → Delete project

---

## Key Lesson

`@astrojs/cloudflare` v13+ uses the Workers + Assets deployment model. Deploy with
`wrangler deploy`, not `wrangler pages deploy`. Cloudflare Pages Git integration is
incompatible with this adapter version. See `context/foundation/lessons.md` for details.
