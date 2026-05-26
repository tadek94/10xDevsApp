# Deploy Plan — 10xCards First Production Deploy

**Executed:** 2026-05-26  
**Platform:** Cloudflare Workers + Assets  
**Worker name:** `10xdevsapp`  
**Production URL:** https://10xdevsapp.tadeusz-karczynski.workers.dev  
**Current Version ID:** af2677a2-fe3c-4a63-a86d-64e31fd0c71c

---

## Steps Executed

### 1. Build
```bash
npm run build
```
Output: `dist/server/entry.mjs` + `dist/client/` (static assets)

### 2. Adapter config adjustment
`astro.config.mjs` — added `imageService: "passthrough"` to disable unused Cloudflare Images binding.

### 3. KV Namespace (SESSION)
Auto-provisioned by `@astrojs/cloudflare` adapter during first deploy attempt.  
Namespace ID added to `wrangler.jsonc` to prevent duplicate creation on subsequent deploys:
```jsonc
"kv_namespaces": [
  { "binding": "SESSION", "id": "cc19b3691381499abd7c7aeaca9058ba" }
]
```

### 4. Deploy
```bash
npx wrangler deploy
```
Runs from project root — wrangler reads `.wrangler/deploy/config.json` which redirects to `dist/server/wrangler.json`.

### 5. Secrets
```bash
npx wrangler secret put SUPABASE_URL --name 10xdevsapp
npx wrangler secret put SUPABASE_KEY --name 10xdevsapp
```
Values sourced from `.dev.vars`. `OPENROUTER_API_KEY` not set (key not available at deploy time; field is `optional` in `astro.config.mjs`).

---

## Active Bindings

| Binding | Resource | ID |
|---------|----------|----|
| `env.SESSION` | KV Namespace | cc19b3691381499abd7c7aeaca9058ba |
| `env.ASSETS` | Assets | (auto) |
| `SUPABASE_URL` | Secret | — |
| `SUPABASE_KEY` | Secret | — |

---

## Rollback

```bash
npx wrangler rollback --name 10xdevsapp
# or to specific version:
npx wrangler deployments list --name 10xdevsapp
npx wrangler rollback <deployment-id> --name 10xdevsapp
```

## Logs

```bash
npx wrangler tail --name 10xdevsapp
```

## Subsequent Deploys

```bash
npm run build && npx wrangler deploy
```

---

## Known Gaps

- `OPENROUTER_API_KEY` not configured — AI flashcard generation will not work until key is added:
  ```bash
  npx wrangler secret put OPENROUTER_API_KEY --name 10xdevsapp
  ```
- `site` not set in `astro.config.mjs` — sitemap skipped (non-critical for MVP)
- No custom domain configured — using `workers.dev` subdomain
- GitHub Actions CI auto-deploy not wired — deploy is currently manual (`npm run build && npx wrangler deploy`)
