# Production State — 10xCards

**Last updated:** 2026-06-08  
**Platform:** Cloudflare Workers + Assets  
**Worker name:** `10xdevsapp`  
**Production URL:** https://10xdevsapp.tadeusz-karczynski.workers.dev  
**Account ID:** `6a2198114e119e5cced7141213d8216b`

---

## Deploy Flow

Push do `main` → GitHub Actions → `npm run build` + `npx wrangler deploy` → Cloudflare Worker.

Ręczny deploy (lokalnie):
```bash
npm run build && npx wrangler deploy
```

---

## Active Bindings & Secrets

| Nazwa | Typ | Wartość / ID |
|-------|-----|--------------|
| `env.SESSION` | KV Namespace | `cc19b3691381499abd7c7aeaca9058ba` |
| `env.ASSETS` | Assets | (auto) |
| `SUPABASE_URL` | Secret | ustawiony |
| `SUPABASE_KEY` | Secret | ustawiony |
| `OPENROUTER_API_KEY` | Secret | ustawiony — AI generation działa (potwierdzone 2026-06-08) |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | ustawiony — wymagany przez usuwanie konta (S-04) |

---

## Operational Commands

```bash
# Logi na żywo
npx wrangler tail --name 10xdevsapp

# Lista deploymentów
npx wrangler deployments list --name 10xdevsapp

# Rollback do poprzedniej wersji
npx wrangler rollback --name 10xdevsapp

# Dodanie brakującego sekretu
npx wrangler secret put OPENROUTER_API_KEY --name 10xdevsapp
```

---

## Co działa

- Strona produkcyjna (HTTP 200)
- Rejestracja i logowanie (Supabase auth bez potwierdzenia emaila)
- Auto-deploy na push do `main` (GitHub Actions)
- AI generation fiszek (potwierdzone 2026-06-08 — `OPENROUTER_API_KEY` ustawiony, działa na obecnym planie)

## Co nie działa

- Sitemap — brak `site` w `astro.config.mjs` (nieistotne dla MVP)

## Backlog operacyjny (nie blokuje MVP)

- Supabase redirect URLs — dodać prod URL (Authentication → URL Configuration) dla poprawnego flow potwierdzania e-maila
- Skasować osierocony projekt Cloudflare Pages `10xdevsapp` (pozostałość po nieudanej próbie Pages)
- Workers Paid plan ($5/mies.) — rozważyć, jeśli pojawią się timeouty CPU na AI routes pod obciążeniem (na razie generation działa na obecnym planie)
