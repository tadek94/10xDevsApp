# Production State — 10xCards

**Last updated:** 2026-05-26  
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
| `OPENROUTER_API_KEY` | Secret | **nie ustawiony** — AI routes nie działają |

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

## Co nie działa

- AI routes — brak `OPENROUTER_API_KEY`
- Sitemap — brak `site` w `astro.config.mjs` (nieistotne dla MVP)

## Do zrobienia przed uruchomieniem AI

1. Dodać `OPENROUTER_API_KEY` (patrz wyżej)
2. Upgrade do Workers Paid plan ($5/mies.) — free tier ma limit 10ms CPU, za mało dla wywołań OpenRouter
